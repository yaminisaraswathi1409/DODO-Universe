path = 'backend/internal/handler/catalog_handler.go'
with open(path, 'rb') as f:
    raw = f.read()

is_crlf = b'\r\n' in raw
text = raw.decode('utf-8')

old_block = """\tvar reviewerID *uuid.UUID
\treviewerName := "Admin Reviewer"
\tclaims, ok := middleware.GetUserClaims(r.Context())
\tif ok && claims.UserID != uuid.Nil {
\t\treviewerID = &claims.UserID
\t}"""

new_block = """\tvar reviewerID *uuid.UUID
\treviewerName := "Admin Reviewer"
\tclaims, ok := middleware.GetUserClaims(r.Context())
\tif ok && claims.SupabaseUID != "" {
\t\tif u, _ := h.userRepo.GetBySupabaseUID(r.Context(), claims.SupabaseUID); u != nil {
\t\t\treviewerID = &u.ID
\t\t\tif u.FullName != "" {
\t\t\t\treviewerName = u.FullName
\t\t\t}
\t\t}
\t}"""

if is_crlf:
    old_block = old_block.replace('\n', '\r\n')
    new_block = new_block.replace('\n', '\r\n')

assert old_block in text, "old_block not found in catalog_handler.go"
text = text.replace(old_block, new_block)

with open(path, 'wb') as f:
    f.write(text.encode('utf-8'))
print("Successfully patched catalog_handler.go")

