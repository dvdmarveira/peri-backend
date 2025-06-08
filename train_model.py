import pandas as pd
from pymongo import MongoClient
from xgboost import XGBClassifier
from sklearn.preprocessing import OneHotEncoder, LabelEncoder
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
import pickle

# 1. Conectar ao MongoDB e puxar dados
try:
    client = MongoClient("mongodb://localhost:27017/", serverSelectionTimeoutMS=5000)  # Timeout para conexão
    client.server_info()  # Verifica se o servidor está acessível
    db = client["plataforma-odontolegal"]  # Banco alinhado com Node.js
    colecao = db["dashboard"]  # Coleção correta

    # Verificar se a coleção existe, se não, criar com dados de teste
    if "plataforma-odontolegal" not in db.list_collection_names():
        print("Coleção 'plataforma-odontolegal' não encontrada. Criando coleção com dados de teste...")
        colecao.insert_many([
            {
                "vitima": {"idade": 30, "etnia": "Branca"},
                "localizacao": "São Paulo",
                "tipo_do_caso": "Caso A"
            },
            {
                "vitima": {"idade": 25, "etnia": "Parda"},
                "localizacao": "Rio de Janeiro",
                "tipo_do_caso": "Caso B"
            },
            {
                "vitima": {"idade": 40, "etnia": "Negra"},
                "localizacao": "Belo Horizonte",
                "tipo_do_caso": "Caso A"
            }
        ])
        print("Dados de teste inseridos com sucesso.")

    # Puxar dados
    dados = list(colecao.find({}, {"_id": 0}))
    if not dados:
        raise ValueError("Nenhum dado encontrado na coleção 'plataforma-odontolegal' após tentativa de inserção.")

    # Print sample data for debugging
    print("Sample MongoDB documents:", dados[:2])

except Exception as e:
    print(f"Erro ao conectar ou acessar dados no MongoDB: {e}")
    exit(1)

# 2. Preparar DataFrame flat
lista = []
for d in dados:
    try:
        lista.append({
            "idade": d["vitima"]["idade"],
            "etnia": d["vitima"]["etnia"],
            "localizacao": d["localizacao"],
            "tipo_do_caso": d["tipo_do_caso"]
        })
    except (KeyError, TypeError) as e:
        print(f"Erro no documento: {d}, Erro: {e}")
        continue

df = pd.DataFrame(lista)
if df.empty:
    raise ValueError("DataFrame está vazio após processar os dados do MongoDB. Verifique a estrutura dos documentos.")

# Print DataFrame info for debugging
print("Colunas:", df.columns)
print("Primeiras linhas:\n", df.head())
print("Tipos de dados:\n", df.dtypes)

# 3. Variáveis explicativas e alvo
X = df[["idade", "etnia", "localizacao"]]
y = df["tipo_do_caso"]

# 4. Encode da variável alvo
label_encoder = LabelEncoder()
y_encoded = label_encoder.fit_transform(y)

# 5. Pipeline
categorical_features = ["etnia", "localizacao"]
numeric_features = ["idade"]

preprocessor = ColumnTransformer(
    transformers=[
        ("cat", OneHotEncoder(handle_unknown='ignore'), categorical_features),
        ("num", "passthrough", numeric_features)
    ]
)

pipeline = Pipeline([
    ("preprocessor", preprocessor),
    ("classifier", XGBClassifier(use_label_encoder=False, eval_metric='mlogloss'))
])

# 6. Treinar
try:
    pipeline.fit(X, y_encoded)
except Exception as e:
    print(f"Erro ao treinar o modelo: {e}")
    exit(1)

# 7. Salvar pipeline + label encoder
try:
    with open("model.pkl", "wb") as f:
        pickle.dump({
            "pipeline": pipeline,
            "label_encoder": label_encoder
        }, f)
    print("Modelo treinado e salvo em model.pkl")
except Exception as e:
    print(f"Erro ao salvar o modelo: {e}")
    exit(1)