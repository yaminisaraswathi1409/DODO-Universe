path = 'frontend/src/components/CatalogOfferingWizardModal.tsx'
with open(path, 'rb') as f:
    raw = f.read()

is_crlf = b'\r\n' in raw
text = raw.decode('utf-8')

old_code = """        const res = await uploadFile(file, 'catalog');
        if (res?.file_url) {
          uploaded.push(res.file_url);
        }"""

new_code = """        const res = await uploadFile(file);
        if (res?.url) {
          uploaded.push(res.url);
        }"""

if is_crlf:
    old_code = old_code.replace('\n', '\r\n')
    new_code = new_code.replace('\n', '\r\n')

assert old_code in text, "old_code not found"
text = text.replace(old_code, new_code)

with open(path, 'wb') as f:
    f.write(text.encode('utf-8'))
print("Fixed uploadFile call in CatalogOfferingWizardModal.tsx")

