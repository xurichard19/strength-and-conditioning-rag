from langchain_community.document_loaders import PyMuPDFLoader, UnstructuredPowerPointLoader
import os
from tqdm import tqdm
import pickle
from shingo.ingestion import IngestionHandler

cache = os.path.join('data', 'processed', 'script_test.pkl')

pdfs = []
not_pdf = []
scanned = []
for name in tqdm(os.listdir(os.path.join("data", "raw"))):
    path = os.path.join("data", "raw", name)
    if path.endswith('.pdf'):
        if IngestionHandler.is_native_pdf(path):
            pdfs.append(path)
        else:
            scanned.append(path)
    else:
        not_pdf.append(path)

print(pdfs)
print(scanned)
print(not_pdf)

help = IngestionHandler()
doc = help.bad_loader("data\\raw\\developing_a_strength_power_program_for_amateur.9.pdf")
print(doc[:3])
print()
for i in help.load_single_doc("data\\raw\\developing_a_strength_power_program_for_amateur.9.pdf")[:3]:
    print([i])


""""
docs = []
for path in tqdm(paths):
    loader = PyMuPDFLoader(path)
    doc = loader.load()
    docs.append(doc)


"""