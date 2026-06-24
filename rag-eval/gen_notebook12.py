import json

def code(src): return {"cell_type":"code","metadata":{},"execution_count":None,"outputs":[],"source":src}
def md(src): return {"cell_type":"markdown","metadata":{},"source":src}

cells = []

cells.append(md('''# 12 --- HyDE Retrieval vs. Query Expansion (on the MedQA benchmark)

**New idea: HyDE (Hypothetical Document Embeddings).** Instead of searching with the raw question,
the model first writes a short *hypothetical German guideline-style answer*, then we search with **that**.
The hypothetical text carries the formal German clinical vocabulary the AWMF guidelines actually use,
so it usually retrieves better-matching chunks than the bare cross-lingual question.

We compare, head to head, on **your existing MedQA benchmark**:
- **Baseline** = translate + MeSH query expansion (your current method).
- **HyDE** = generate a hypothetical German passage, embed it, retrieve.

Reported **both on the full set and the answerable subset** (corpus-grounded GT), with the 4 RAGAS metrics.
Neon reconnect + judge max_tokens fixes are baked in. Single generator = Mistral.'''))

cells.append(md('## 1. Install'))
cells.append(code('!pip install -q ragas langchain langchain-openai langchain-huggingface psycopg2-binary pgvector langchain-postgres datasets nest_asyncio sentence-transformers'))

cells.append(md('## 2. VertexAI import patch'))
cells.append(code('''import sys, types
class DummyVertexAI: pass
class DummyChatVertexAI: pass
m = types.ModuleType("langchain_community.llms"); m.VertexAI = DummyVertexAI; sys.modules["langchain_community.llms"] = m
m = types.ModuleType("langchain_community.chat_models"); m.ChatVertexAI = DummyChatVertexAI; sys.modules["langchain_community.chat_models"] = m
m = types.ModuleType("langchain_community.chat_models.vertexai"); m.ChatVertexAI = DummyChatVertexAI; sys.modules["langchain_community.chat_models.vertexai"] = m
m = types.ModuleType("langchain_community.llms.vertexai"); m.VertexAI = DummyVertexAI; sys.modules["langchain_community.llms.vertexai"] = m'''))

cells.append(md('## 3. Setup: resilient DB engine, embedder, reranker, models, prompts'))
cells.append(code('''import os, json, time, random
import pandas as pd, torch, nest_asyncio
from google.colab import userdata, drive
from sqlalchemy import create_engine
from langchain_openai import ChatOpenAI
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_postgres import PGVector
from langchain_core.prompts import PromptTemplate
from sentence_transformers import CrossEncoder

nest_asyncio.apply()
drive.mount('/content/drive')

DRIVE_PATH = '/content/drive/MyDrive/'
df = pd.read_csv(DRIVE_PATH + 'AWMF_Golden_Dataset_200Q_Final.csv')
print("Loaded", len(df), "rows.")

NEON = userdata.get('NEON_DATABASE_URL')
os.environ["OPENROUTER_API_KEY"] = userdata.get('OPENROUTER_API_KEY')

# Resilient Neon engine (serverless drops idle SSL connections)
engine = create_engine(NEON, pool_pre_ping=True, pool_recycle=180, pool_size=2, max_overflow=2,
                       connect_args={"sslmode":"require","keepalives":1,"keepalives_idle":30,
                                     "keepalives_interval":10,"keepalives_count":5})

bge = HuggingFaceEmbeddings(model_name="BAAI/bge-m3", model_kwargs={'device':'cpu'})
vs = PGVector(embeddings=bge, collection_name="awmf_baseline_bge", connection=engine, use_jsonb=True)

K_RETRIEVE = 30
K_FINAL = 8
USE_RERANKER = False   # flip to True (loads ~2GB) to add reranking on top of HyDE
retriever = vs.as_retriever(search_kwargs={"k": K_RETRIEVE})

reranker = None
if USE_RERANKER:
    reranker = CrossEncoder("BAAI/bge-reranker-v2-m3", max_length=512,
                            device="cuda" if torch.cuda.is_available() else "cpu")
    print("reranker loaded")

def make_llm(model, max_tokens=1024):
    return ChatOpenAI(model=model, api_key=os.environ["OPENROUTER_API_KEY"],
                      base_url="https://openrouter.ai/api/v1", temperature=0,
                      max_tokens=max_tokens, max_retries=6, request_timeout=90)

mistral = make_llm("mistralai/mistral-large")

def safe_invoke(llm, prompt, max_tries=8, base=8):
    for a in range(max_tries):
        try:
            return llm.invoke(prompt).content.strip()
        except Exception as e:
            if a == max_tries-1: raise
            w = min(base*(2**a)+random.uniform(0,3), 120)
            print(f"  retry {a+1}: {str(e)[:70]} ... {w:.0f}s"); time.sleep(w)

# --- Prompts ---
# Baseline: translate + MeSH expansion (your current method)
expand_prompt = PromptTemplate(template="""You are a medical search term generator.
Translate the English question to German, then add 3-4 formal German clinical synonyms / related conditions / MeSH terms.
Output ONLY the German question + synonyms as one continuous search string. No labels, no bullets.

English Question:
{question}""", input_variables=["question"])

# HyDE: write a hypothetical German guideline passage, which we embed for search
hyde_prompt = PromptTemplate(template="""You are a German medical guideline expert.
Write a short, factual German passage (3-5 sentences) that would plausibly answer the clinical question below,
as if quoted from an official clinical guideline. Use formal German medical terminology.
Do NOT say you are unsure; write the most likely guideline-style content. Output ONLY the German passage.

Clinical question (English):
{question}""", input_variables=["question"])

qa_prompt = PromptTemplate(template="""You are an expert medical AI. Read the German clinical guidelines and answer in ENGLISH.
Use ONLY the provided German context. If the context does not contain the answer, say so plainly.

Context (German):
{context}

Question (English):
{question}

Answer (English):""", input_variables=["context","question"])

print("Setup complete.")'''))

cells.append(md('## 4. Retrieval functions: baseline expansion vs. HyDE'))
cells.append(code('''def _rerank_or_top(query, texts, k_final):
    if reranker is not None and texts:
        scores = reranker.predict([[query, t] for t in texts])
        texts = [t for _, t in sorted(zip(scores, texts), key=lambda x: x[0], reverse=True)]
    return texts[:k_final]

def retrieve_baseline(question, k_final=K_FINAL):
    gq = safe_invoke(mistral, expand_prompt.format(question=question))
    docs = retriever.invoke(gq)
    return _rerank_or_top(gq, [d.page_content for d in docs], k_final)

def retrieve_hyde(question, k_final=K_FINAL):
    passage = safe_invoke(mistral, hyde_prompt.format(question=question))   # the "think first" step
    docs = retriever.invoke(passage)                                        # search with the hypothetical answer
    return _rerank_or_top(passage, [d.page_content for d in docs], k_final)

# smoke test
_q = df.iloc[0]['English_Open_Question']
print("baseline top:", retrieve_baseline(_q)[0][:160], "...")
print("hyde     top:", retrieve_hyde(_q)[0][:160], "...")'''))

cells.append(md('''## 5. Generate answers for BOTH methods (on the answerable subset)

We evaluate on the **corpus-answerable** questions (from the ground-truth file built in notebook 11),
so the metrics are meaningful. Each question gets a baseline answer and a HyDE answer.'''))
cells.append(code('''# Load corpus-grounded GT (built in notebook 11) -> tells us which questions are answerable
gt_df = pd.read_csv(DRIVE_PATH + "AWMF_CorpusGrounded_GroundTruth.csv")
gt_map = gt_df.set_index('English_Open_Question')['corpus_ground_truth'].to_dict()
answerable = [q for q, a in gt_map.items() if a != 'NOT_IN_CORPUS']
work = df[df['English_Open_Question'].isin(answerable)].reset_index(drop=True)
print(f"Answerable questions to evaluate: {len(work)}")

def run_method(name, retrieve_fn):
    out_file = DRIVE_PATH + f"HYDE_{name}_results.json"
    if os.path.exists(out_file):
        res = json.load(open(out_file)); start = len(res["question"])
    else:
        res = {"question":[],"answer":[],"contexts":[],"medqa_ground_truth":[],"corpus_ground_truth":[]}; start = 0
    for i in range(start, len(work)):
        r = work.iloc[i]; q = r['English_Open_Question']
        try:
            ctx = retrieve_fn(q)
            ans = safe_invoke(mistral, qa_prompt.format(context="\\n\\n".join(ctx), question=q))
            res["question"].append(q); res["answer"].append(ans); res["contexts"].append(ctx)
            res["medqa_ground_truth"].append(r['English_Correct_Text'])
            res["corpus_ground_truth"].append(gt_map.get(q, "NOT_IN_CORPUS"))
            json.dump(res, open(out_file,"w"))
            if (i+1) % 10 == 0: print(f"  [{name}] {i+1}/{len(work)}")
            time.sleep(1.2)
        except Exception as e:
            print("err", i, e); time.sleep(5)
    print(f"{name} done -> {out_file}")
    return out_file

print("=== BASELINE (query expansion) ==="); run_method("baseline", retrieve_baseline)
print("=== HyDE ===");                       run_method("hyde", retrieve_hyde)'''))

cells.append(md('## 6. RAGAS evaluation --- baseline vs. HyDE (judge max_tokens fixed)'))
cells.append(code('''from datasets import Dataset, Features, Value, Sequence
from ragas import evaluate
from ragas.metrics import context_precision, context_recall, faithfulness, answer_relevancy
from ragas.llms import LangchainLLMWrapper
from ragas.embeddings import LangchainEmbeddingsWrapper
from ragas.run_config import RunConfig

judge = LangchainLLMWrapper(make_llm("openai/gpt-4o-mini", max_tokens=4096))   # <-- fixes truncation
remb = LangchainEmbeddingsWrapper(bge)
feat = Features({"question":Value("string"),"answer":Value("string"),
                 "contexts":Sequence(Value("string")),"ground_truth":Value("string")})

def score(name, gt_key):
    data = json.load(open(DRIVE_PATH + f"HYDE_{name}_results.json"))
    dd = {"question":data["question"],"answer":data["answer"],"contexts":data["contexts"],"ground_truth":data[gt_key]}
    ds = Dataset.from_dict(dd, features=feat)
    out = evaluate(ds, metrics=[context_precision, context_recall, faithfulness, answer_relevancy],
                   llm=judge, embeddings=remb, run_config=RunConfig(timeout=300, max_workers=2, max_retries=5))
    return out.to_pandas()[["context_precision","context_recall","faithfulness","answer_relevancy"]].mean().round(3)

print("=== Scored against CORPUS-GROUNDED ground truth (the fair measure) ===")
print("BASELINE:", dict(score("baseline", "corpus_ground_truth")))
print("HyDE    :", dict(score("hyde", "corpus_ground_truth")))
print("\\n=== Scored against MedQA ground truth (your original benchmark) ===")
print("BASELINE:", dict(score("baseline", "medqa_ground_truth")))
print("HyDE    :", dict(score("hyde", "medqa_ground_truth")))'''))

nb = {"cells": cells,
      "metadata": {"colab": {"provenance": []},
                   "kernelspec": {"name": "python3", "display_name": "Python 3"},
                   "language_info": {"name": "python"}},
      "nbformat": 4, "nbformat_minor": 0}
with open("12-HyDE-Retrieval.ipynb", "w", encoding="utf-8") as f:
    json.dump(nb, f, indent=1)
print("Wrote 12-HyDE-Retrieval.ipynb with", len(cells), "cells")
