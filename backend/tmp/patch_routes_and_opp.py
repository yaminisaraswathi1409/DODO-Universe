import sys

# 1. Update backend/cmd/api/main.go
with open('backend/cmd/api/main.go', 'rb') as f:
    api_bytes = f.read()
api_is_crlf = b'\r\n' in api_bytes
api_text = api_bytes.decode('utf-8')

admin_target = """\t\tr.Post("/admin/catalog/{id}/reject", func(w http.ResponseWriter, r *http.Request) {
\t\t\tif catalogHandler == nil {
\t\t\t\tresponse.Error(w, http.StatusServiceUnavailable, "Catalog service unavailable", nil)
\t\t\t\treturn
\t\t\t}
\t\t\tcatalogHandler.RejectCatalogItem(w, r)
\t\t})"""

admin_replacement = """\t\tr.Post("/admin/catalog/{id}/reject", func(w http.ResponseWriter, r *http.Request) {
\t\t\tif catalogHandler == nil {
\t\t\t\tresponse.Error(w, http.StatusServiceUnavailable, "Catalog service unavailable", nil)
\t\t\t\treturn
\t\t\t}
\t\t\tcatalogHandler.RejectCatalogItem(w, r)
\t\t})

\t\tr.Post("/admin/catalog/{id}/request-changes", func(w http.ResponseWriter, r *http.Request) {
\t\t\tif catalogHandler == nil {
\t\t\t\tresponse.Error(w, http.StatusServiceUnavailable, "Catalog service unavailable", nil)
\t\t\t\treturn
\t\t\t}
\t\t\tcatalogHandler.RequestChangesCatalogItem(w, r)
\t\t})"""

vendor_target = """\t\tr.Get("/vendors/{vendor_id}/catalog", func(w http.ResponseWriter, r *http.Request) {
\t\t\tif catalogHandler == nil {
\t\t\t\tresponse.Error(w, http.StatusServiceUnavailable, "Catalog service unavailable", nil)
\t\t\t\treturn
\t\t\t}
\t\t\tcatalogHandler.GetVendorCatalog(w, r)
\t\t})"""

vendor_replacement = """\t\tr.Get("/vendors/{vendor_id}/catalog", func(w http.ResponseWriter, r *http.Request) {
\t\t\tif catalogHandler == nil {
\t\t\t\tresponse.Error(w, http.StatusServiceUnavailable, "Catalog service unavailable", nil)
\t\t\t\treturn
\t\t\t}
\t\t\tcatalogHandler.GetVendorCatalog(w, r)
\t\t})

\t\tr.Get("/vendors/{vendor_id}/catalog/tree", func(w http.ResponseWriter, r *http.Request) {
\t\t\tif catalogHandler == nil {
\t\t\t\tresponse.Error(w, http.StatusServiceUnavailable, "Catalog service unavailable", nil)
\t\t\t\treturn
\t\t\t}
\t\t\tcatalogHandler.GetVendorCatalogTree(w, r)
\t\t})

\t\tr.Post("/vendor/catalog/{id}/move", func(w http.ResponseWriter, r *http.Request) {
\t\t\tif catalogHandler == nil {
\t\t\t\tresponse.Error(w, http.StatusServiceUnavailable, "Catalog service unavailable", nil)
\t\t\t\treturn
\t\t\t}
\t\t\tcatalogHandler.MoveCatalogNode(w, r)
\t\t})

\t\tr.Post("/vendor/catalog/reorder", func(w http.ResponseWriter, r *http.Request) {
\t\t\tif catalogHandler == nil {
\t\t\t\tresponse.Error(w, http.StatusServiceUnavailable, "Catalog service unavailable", nil)
\t\t\t\treturn
\t\t\t}
\t\t\tcatalogHandler.ReorderCatalogNodes(w, r)
\t\t})

\t\tr.Post("/vendor/catalog/{id}/archive", func(w http.ResponseWriter, r *http.Request) {
\t\t\tif catalogHandler == nil {
\t\t\t\tresponse.Error(w, http.StatusServiceUnavailable, "Catalog service unavailable", nil)
\t\t\t\treturn
\t\t\t}
\t\t\tcatalogHandler.ArchiveCatalogItem(w, r)
\t\t})"""

if api_is_crlf:
    admin_target = admin_target.replace('\n', '\r\n')
    admin_replacement = admin_replacement.replace('\n', '\r\n')
    vendor_target = vendor_target.replace('\n', '\r\n')
    vendor_replacement = vendor_replacement.replace('\n', '\r\n')

assert admin_target in api_text, "admin_target not found in main.go"
assert vendor_target in api_text, "vendor_target not found in main.go"

api_text = api_text.replace(admin_target, admin_replacement, 1)
api_text = api_text.replace(vendor_target, vendor_replacement, 1)

with open('backend/cmd/api/main.go', 'wb') as f:
    f.write(api_text.encode('utf-8'))
print("Updated backend/cmd/api/main.go successfully")

# 2. Update backend/internal/service/opportunity_service.go
with open('backend/internal/service/opportunity_service.go', 'rb') as f:
    opp_bytes = f.read()
opp_is_crlf = b'\r\n' in opp_bytes
opp_text = opp_bytes.decode('utf-8')

opp_target = """\t\t// Enforce Backend Minimum Order Quantity (MOQ) rule for Catalog Purchases
\t\tif s.catalogRepo != nil && opp.CatalogItemID != nil && *opp.CatalogItemID != uuid.Nil {
\t\t\titem, cErr := s.catalogRepo.GetCatalogItemByID(ctx, *opp.CatalogItemID)
\t\t\tif cErr == nil && item != nil && item.MinOrderQuantity > 1 {
\t\t\t\treqQty := 1.0
\t\t\t\tif opp.Quantity != nil && *opp.Quantity > 0 {
\t\t\t\t\treqQty = *opp.Quantity
\t\t\t\t}
\t\t\t\tif reqQty < float64(item.MinOrderQuantity) {
\t\t\t\t\treturn nil, fmt.Errorf("cannot place catalog order: requested quantity (%.0f) is below vendor's minimum order quantity (%d). Please use 'Request What You Need' for custom quantities.", reqQty, item.MinOrderQuantity)
\t\t\t\t}
\t\t\t}
\t\t}"""

opp_replacement = """\t\t// Enforce Backend Minimum Order Quantity (MOQ) and Offering Eligibility rule for Catalog Purchases
\t\tif s.catalogRepo != nil && opp.CatalogItemID != nil && *opp.CatalogItemID != uuid.Nil {
\t\t\titem, cErr := s.catalogRepo.GetCatalogItemByID(ctx, *opp.CatalogItemID)
\t\t\tif cErr == nil && item != nil {
\t\t\t\t// Prevent purchasing grouping nodes
\t\t\t\tif item.NodeType == "GROUPING" {
\t\t\t\t\treturn nil, fmt.Errorf("cannot purchase a grouping catalog node. Grouping nodes are for organization only.")
\t\t\t\t}
\t\t\t\t// Prevent purchasing unapproved offerings
\t\t\t\tif item.Status != "" && item.Status != "ACTIVE_IN_CATALOG" && item.Status != "APPROVED" {
\t\t\t\t\treturn nil, fmt.Errorf("cannot place catalog order: item is currently %s and not approved for purchase.", item.Status)
\t\t\t\t}
\t\t\t\t// Prevent quotation-only items from instant checkout
\t\t\t\tif item.PriceType == "QUOTATION" && opp.WorkflowModel == domain.WorkflowInstant {
\t\t\t\t\treturn nil, fmt.Errorf("quotation-only offerings cannot be checked out via instant checkout. Please request a quote.")
\t\t\t\t}
\t\t\t\t// MOQ enforcement
\t\t\t\tif item.MinOrderQuantity > 1 {
\t\t\t\t\treqQty := 1.0
\t\t\t\t\tif opp.Quantity != nil && *opp.Quantity > 0 {
\t\t\t\t\t\treqQty = *opp.Quantity
\t\t\t\t\t}
\t\t\t\t\tif reqQty < float64(item.MinOrderQuantity) {
\t\t\t\t\t\treturn nil, fmt.Errorf("cannot place catalog order: requested quantity (%.0f) is below vendor's minimum order quantity (%d). Please use 'Request What You Need' for custom quantities.", reqQty, item.MinOrderQuantity)
\t\t\t\t\t}
\t\t\t\t}
\t\t\t}
\t\t}"""

if opp_is_crlf:
    opp_target = opp_target.replace('\n', '\r\n')
    opp_replacement = opp_replacement.replace('\n', '\r\n')

assert opp_target in opp_text, "opp_target not found in opportunity_service.go"

opp_text = opp_text.replace(opp_target, opp_replacement, 1)

with open('backend/internal/service/opportunity_service.go', 'wb') as f:
    f.write(opp_text.encode('utf-8'))
print("Updated backend/internal/service/opportunity_service.go successfully")

