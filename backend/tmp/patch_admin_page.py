path = 'frontend/src/app/admin/users/page.tsx'
with open(path, 'rb') as f:
    raw = f.read()

is_crlf = b'\r\n' in raw
text = raw.decode('utf-8')

# 1. Update imports
old_imp = """  getAdminCatalogRequests,
  approveCatalogItem,
  rejectCatalogItem,"""

new_imp = """  getAdminCatalogRequests,
  approveCatalogItem,
  rejectCatalogItem,
  requestChangesCatalogItem,
  getVendorCatalogTree,"""

# 2. Update state
old_st = """  const [catalogRequests, setCatalogRequests] = useState<VendorCatalogItem[]>([]);
  const [rejectingCatalogItem, setRejectingCatalogItem] = useState<VendorCatalogItem | null>(null);
  const [catalogRejectionReason, setCatalogRejectionReason] = useState('');"""

new_st = """  const [catalogRequests, setCatalogRequests] = useState<VendorCatalogItem[]>([]);
  const [rejectingCatalogItem, setRejectingCatalogItem] = useState<VendorCatalogItem | null>(null);
  const [catalogRejectionReason, setCatalogRejectionReason] = useState('');
  const [requestingChangesCatalogItem, setRequestingChangesCatalogItem] = useState<VendorCatalogItem | null>(null);
  const [catalogChangeNotes, setCatalogChangeNotes] = useState('');
  const [adminCategoryFilter, setAdminCategoryFilter] = useState('ALL');
  const [adminVendorFilter, setAdminVendorFilter] = useState('ALL');
  const [previewTreeVendor, setPreviewTreeVendor] = useState<UserProfile | null>(null);
  const [previewTreeData, setPreviewTreeData] = useState<VendorCatalogItem[]>([]);
  const [loadingTree, setLoadingTree] = useState(false);"""

# 3. Add handler functions
old_handler = """  const handleRejectCatalogSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectingCatalogItem) return;
    try {
      await rejectCatalogItem(rejectingCatalogItem.id, catalogRejectionReason);
      setCatalogRequests((prev) => prev.filter((item) => item.id !== rejectingCatalogItem.id));
      setRejectingCatalogItem(null);
      setCatalogRejectionReason('');
      alert('Vendor Catalog Listing Rejected.');
    } catch (err: any) {
      alert(err.message || 'Failed to reject catalog item');
    }
  };"""

new_handler = """  const handleRejectCatalogSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectingCatalogItem) return;
    if (!catalogRejectionReason.trim()) {
      alert('Rejection reason is mandatory');
      return;
    }
    try {
      await rejectCatalogItem(rejectingCatalogItem.id, catalogRejectionReason);
      setCatalogRequests((prev) => prev.filter((item) => item.id !== rejectingCatalogItem.id));
      setRejectingCatalogItem(null);
      setCatalogRejectionReason('');
      alert('Vendor Catalog Listing Rejected.');
    } catch (err: any) {
      alert(err.message || 'Failed to reject catalog item');
    }
  };

  const handleRequestChangesSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requestingChangesCatalogItem) return;
    if (!catalogChangeNotes.trim()) {
      alert('Change request notes are mandatory');
      return;
    }
    try {
      await requestChangesCatalogItem(requestingChangesCatalogItem.id, catalogChangeNotes);
      setCatalogRequests((prev) => prev.filter((item) => item.id !== requestingChangesCatalogItem.id));
      setRequestingChangesCatalogItem(null);
      setCatalogChangeNotes('');
      alert('Changes requested successfully. Vendor notified.');
    } catch (err: any) {
      alert(err.message || 'Failed to request changes');
    }
  };

  const handleOpenVendorTree = async (vendor: UserProfile) => {
    setPreviewTreeVendor(vendor);
    setLoadingTree(true);
    try {
      const tree = await getVendorCatalogTree(vendor.id, undefined, true);
      setPreviewTreeData(tree);
    } catch (err) {
      setPreviewTreeData([]);
    } finally {
      setLoadingTree(false);
    }
  };"""

if is_crlf:
    old_imp = old_imp.replace('\n', '\r\n')
    new_imp = new_imp.replace('\n', '\r\n')
    old_st = old_st.replace('\n', '\r\n')
    new_st = new_st.replace('\n', '\r\n')
    old_handler = old_handler.replace('\n', '\r\n')
    new_handler = new_handler.replace('\n', '\r\n')

assert old_imp in text, "old_imp not found"
assert old_st in text, "old_st not found"
assert old_handler in text, "old_handler not found"

text = text.replace(old_imp, new_imp, 1)
text = text.replace(old_st, new_st, 1)
text = text.replace(old_handler, new_handler, 1)

# 4. Update the catalog filter controls & table rendering
old_table_header = """            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="font-extrabold text-lg text-slate-900">Vendor Service Offering Approvals ({catalogRequests.length})</h3>
                  <p className="text-xs text-slate-500 mt-1">Review vendor submitted sub-services & offerings before publishing to customer marketplace.</p>
                </div>
                <span className="px-3 py-1 rounded-full text-xs font-extrabold bg-amber-50 text-amber-800 border border-amber-200 font-mono">
                  Filter: {catalogStatusFilter}
                </span>
              </div>"""

new_table_header = """            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div>
                  <h3 className="font-extrabold text-lg text-slate-900">Vendor Catalog & Offering Approvals ({catalogRequests.length})</h3>
                  <p className="text-xs text-slate-500 mt-1">Review vendor submitted grouping nodes & offerings before publishing to customer marketplace.</p>
                </div>

                {/* Filter Controls: Vendor, Category, Status */}
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={adminCategoryFilter}
                    onChange={(e) => setAdminCategoryFilter(e.target.value)}
                    className="px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold bg-white text-slate-700"
                  >
                    <option value="ALL">All Categories</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>

                  <select
                    value={catalogStatusFilter}
                    onChange={(e) => setCatalogStatusFilter(e.target.value)}
                    className="px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold bg-white text-slate-700 font-mono"
                  >
                    <option value="PENDING_ADMIN_APPROVAL">Pending Approval</option>
                    <option value="CHANGES_REQUESTED">Changes Requested</option>
                    <option value="ACTIVE_IN_CATALOG">Approved / Live</option>
                    <option value="REJECTED">Rejected</option>
                    <option value="ALL">All Statuses</option>
                  </select>
                </div>
              </div>"""

old_action_buttons = """                              <button
                                onClick={() => handleApproveCatalogItem(cat.id)}
                                className="w-full px-4 py-2 rounded-xl bg-black hover:bg-slate-800 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-sm"
                              >
                                <Check className="w-4 h-4" />
                                <span>Approve Offering</span>
                              </button>

                              <button
                                onClick={() => {
                                  setRejectingCatalogItem(cat);
                                  setCatalogRejectionReason('');
                                }}
                                className="w-full px-4 py-2 rounded-xl bg-white hover:bg-rose-50 text-rose-700 border border-rose-300 font-bold text-xs flex items-center justify-center gap-1.5 transition-all"
                              >
                                <X className="w-4 h-4" />
                                <span>Reject Offering</span>
                              </button>"""

new_action_buttons = """                              {/* Distinct Grouping vs Bookable Badge */}
                              {cat.node_type === 'GROUPING' && (
                                <div className="p-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-[10px] font-bold">
                                  📁 Grouping Node (Navigation Only - Not Purchasable)
                                </div>
                              )}

                              <button
                                onClick={() => handleApproveCatalogItem(cat.id)}
                                className="w-full px-4 py-2 rounded-xl bg-black hover:bg-slate-800 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-sm"
                              >
                                <Check className="w-4 h-4" />
                                <span>Approve Offering</span>
                              </button>

                              <button
                                onClick={() => {
                                  setRequestingChangesCatalogItem(cat);
                                  setCatalogChangeNotes('');
                                }}
                                className="w-full px-4 py-2 rounded-xl bg-orange-50 hover:bg-orange-100 text-orange-800 border border-orange-200 font-bold text-xs flex items-center justify-center gap-1.5 transition-all"
                              >
                                <AlertTriangle className="w-4 h-4" />
                                <span>Request Changes</span>
                              </button>

                              <button
                                onClick={() => {
                                  setRejectingCatalogItem(cat);
                                  setCatalogRejectionReason('');
                                }}
                                className="w-full px-4 py-2 rounded-xl bg-white hover:bg-rose-50 text-rose-700 border border-rose-300 font-bold text-xs flex items-center justify-center gap-1.5 transition-all"
                              >
                                <X className="w-4 h-4" />
                                <span>Reject Offering</span>
                              </button>

                              {cat.vendor_user && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenVendorTree(cat.vendor_user!)}
                                  className="w-full px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold flex items-center justify-center gap-1 transition-all"
                                >
                                  <Folder className="w-3.5 h-3.5" />
                                  <span>View Vendor Tree</span>
                                </button>
                              )}"""

old_rejection_modal = """        {/* Modal Dialog for Catalog Item Rejection Reason */}
        {rejectingCatalogItem && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white p-8 rounded-3xl border border-slate-200 w-full max-w-md space-y-6 relative shadow-xl text-slate-900">
              <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-rose-600" />
                  <span>Reject Catalog Listing</span>
                </h3>
                <button onClick={() => setRejectingCatalogItem(null)} className="text-slate-400 hover:text-slate-900 font-bold text-lg">✕</button>
              </div>

              <form onSubmit={handleRejectCatalogSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">Rejection Reason *</label>
                  <textarea
                    rows={3}
                    value={catalogRejectionReason}
                    onChange={(e) => setCatalogRejectionReason(e.target.value)}
                    placeholder="e.g. Incomplete transport pricing model specified / Storage yard address verification failed"
                    className="w-full p-3.5 rounded-xl bg-white border border-slate-300 text-slate-900 text-sm focus:outline-none focus:border-black placeholder-slate-400"
                    required
                  />
                </div>

                <div className="pt-2 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setRejectingCatalogItem(null)}
                    className="w-1/2 py-3 rounded-xl bg-white text-slate-700 font-semibold text-xs border border-slate-300 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="w-1/2 py-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs transition-all shadow-sm flex items-center justify-center gap-2"
                  >
                    Reject Listing
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}"""

new_rejection_modal = """        {/* Modal Dialog for Catalog Item Rejection Reason */}
        {rejectingCatalogItem && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white p-8 rounded-3xl border border-slate-200 w-full max-w-md space-y-6 relative shadow-xl text-slate-900">
              <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-rose-600" />
                  <span>Reject Catalog Listing</span>
                </h3>
                <button onClick={() => setRejectingCatalogItem(null)} className="text-slate-400 hover:text-slate-900 font-bold text-lg">✕</button>
              </div>

              <form onSubmit={handleRejectCatalogSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">Rejection Reason *</label>
                  <textarea
                    rows={3}
                    value={catalogRejectionReason}
                    onChange={(e) => setCatalogRejectionReason(e.target.value)}
                    placeholder="e.g. Incomplete transport pricing model specified / Storage yard address verification failed"
                    className="w-full p-3.5 rounded-xl bg-white border border-slate-300 text-slate-900 text-sm focus:outline-none focus:border-black placeholder-slate-400"
                    required
                  />
                </div>

                <div className="pt-2 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setRejectingCatalogItem(null)}
                    className="w-1/2 py-3 rounded-xl bg-white text-slate-700 font-semibold text-xs border border-slate-300 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="w-1/2 py-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs transition-all shadow-sm flex items-center justify-center gap-2"
                  >
                    Reject Listing
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal Dialog for Request Changes */}
        {requestingChangesCatalogItem && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white p-8 rounded-3xl border border-slate-200 w-full max-w-md space-y-6 relative shadow-xl text-slate-900">
              <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-orange-600" />
                  <span>Request Changes from Vendor</span>
                </h3>
                <button onClick={() => setRequestingChangesCatalogItem(null)} className="text-slate-400 hover:text-slate-900 font-bold text-lg">✕</button>
              </div>

              <form onSubmit={handleRequestChangesSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">Actionable Feedback / Notes *</label>
                  <textarea
                    rows={4}
                    value={catalogChangeNotes}
                    onChange={(e) => setCatalogChangeNotes(e.target.value)}
                    placeholder="Specify the exact adjustments needed (e.g. Please update photos showing the brick batch label, or revise MOQ to match yard packing capacity)"
                    className="w-full p-3.5 rounded-xl bg-white border border-slate-300 text-slate-900 text-sm focus:outline-none focus:border-black placeholder-slate-400"
                    required
                  />
                </div>

                <div className="pt-2 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setRequestingChangesCatalogItem(null)}
                    className="w-1/2 py-3 rounded-xl bg-white text-slate-700 font-semibold text-xs border border-slate-300 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="w-1/2 py-3 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs transition-all shadow-sm flex items-center justify-center gap-2"
                  >
                    Submit Feedback
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal Dialog for Vendor Tree Preview */}
        {previewTreeVendor && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 w-full max-w-2xl space-y-4 relative shadow-2xl text-slate-900 max-h-[85vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Vendor Catalog Hierarchy Tree</h3>
                  <p className="text-xs text-slate-500">Full tree for {previewTreeVendor.full_name} ({previewTreeVendor.phone})</p>
                </div>
                <button onClick={() => setPreviewTreeVendor(null)} className="text-slate-400 hover:text-slate-900 font-bold text-lg">✕</button>
              </div>

              {loadingTree ? (
                <div className="py-12 text-center text-xs text-slate-500">Loading catalog tree...</div>
              ) : previewTreeData.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400">No nodes in this vendor&apos;s catalog.</div>
              ) : (
                <div className="space-y-2 text-xs">
                  {previewTreeData.map((node) => (
                    <div key={node.id} className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {node.node_type === 'GROUPING' ? <Folder className="w-4 h-4 text-amber-500" /> : <Package className="w-4 h-4 text-blue-500" />}
                        <span className="font-bold">{node.title}</span>
                        <span className="text-[10px] text-slate-400">(Level {node.level || 0})</span>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                        {node.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}"""

if is_crlf:
    old_table_header = old_table_header.replace('\n', '\r\n')
    new_table_header = new_table_header.replace('\n', '\r\n')
    old_action_buttons = old_action_buttons.replace('\n', '\r\n')
    new_action_buttons = new_action_buttons.replace('\n', '\r\n')
    old_rejection_modal = old_rejection_modal.replace('\n', '\r\n')
    new_rejection_modal = new_rejection_modal.replace('\n', '\r\n')

assert old_table_header in text, "old_table_header not found"
assert old_action_buttons in text, "old_action_buttons not found"
assert old_rejection_modal in text, "old_rejection_modal not found"

text = text.replace(old_table_header, new_table_header, 1)
text = text.replace(old_action_buttons, new_action_buttons, 1)
text = text.replace(old_rejection_modal, new_rejection_modal, 1)

with open(path, 'wb') as f:
    f.write(text.encode('utf-8'))
print("Successfully patched admin users page")
