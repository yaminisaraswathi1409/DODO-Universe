path = 'frontend/src/components/VendorCatalogManager.tsx'
with open(path, 'rb') as f:
    raw = f.read()

is_crlf = b'\r\n' in raw
text = raw.decode('utf-8')

# 1. Update imports
old_import = """  getUserServices,
} from '@/lib/api';"""

new_import = """  getUserServices,
  archiveCatalogItem,
  reorderCatalogNodes,
} from '@/lib/api';
import CatalogExplorerTree from '@/components/CatalogExplorerTree';
import CatalogOfferingWizardModal from '@/components/CatalogOfferingWizardModal';
import CatalogMoveNodeModal from '@/components/CatalogMoveNodeModal';
import CatalogItemPreviewModal from '@/components/CatalogItemPreviewModal';"""

# 2. Update state inside VendorCatalogManager
old_state = """  const [editingItem, setEditingItem] = useState<VendorCatalogItem | null>(null);
  const [viewingItem, setViewingItem] = useState<VendorCatalogItem | null>(null);"""

new_state = """  const [editingItem, setEditingItem] = useState<VendorCatalogItem | null>(null);
  const [viewingItem, setViewingItem] = useState<VendorCatalogItem | null>(null);

  // Phase 2 Unlimited Hierarchy & Guided Wizard State
  const [viewMode, setViewMode] = useState<'TREE' | 'GRID'>('TREE');
  const [wizardModalOpen, setWizardModalOpen] = useState(false);
  const [wizardInitialParent, setWizardInitialParent] = useState<VendorCatalogItem | null>(null);
  const [wizardInitialType, setWizardInitialType] = useState<'GROUPING' | 'BOOKABLE'>('BOOKABLE');
  const [moveModalOpen, setMoveModalOpen] = useState(false);
  const [nodeToMove, setNodeToMove] = useState<VendorCatalogItem | null>(null);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewItem, setPreviewItem] = useState<VendorCatalogItem | null>(null);

  const handleOpenWizard = (
    parent: VendorCatalogItem | null = null,
    type: 'GROUPING' | 'BOOKABLE' = 'BOOKABLE',
    itemToEdit: VendorCatalogItem | null = null
  ) => {
    setWizardInitialParent(parent);
    setWizardInitialType(type);
    setEditingItem(itemToEdit);
    setWizardModalOpen(true);
  };

  const handleArchiveNode = async (node: VendorCatalogItem) => {
    if (!confirm(`Are you sure you want to archive "${node.title}"?`)) return;
    try {
      await archiveCatalogItem(node.id, currentUser.id);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to archive node');
    }
  };

  const handleReorderNode = async (node: VendorCatalogItem, direction: 'UP' | 'DOWN') => {
    const siblings = items
      .filter((it) => (it.parent_id || null) === (node.parent_id || null))
      .sort((a, b) => (a.display_order || 0) - (b.display_order || 0));

    const currentIndex = siblings.findIndex((it) => it.id === node.id);
    if (currentIndex === -1) return;
    const targetIndex = direction === 'UP' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= siblings.length) return;

    const newSiblings = [...siblings];
    const temp = newSiblings[currentIndex];
    newSiblings[currentIndex] = newSiblings[targetIndex];
    newSiblings[targetIndex] = temp;

    const orderedIds = newSiblings.map((s) => s.id);
    await reorderCatalogNodes(currentUser.id, node.parent_id || null, orderedIds);
    await loadData();
  };"""

# 3. Update Section 2 header and metrics
old_sec2_header = """          <section className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
              <div>
                <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">MY SERVICE OFFERINGS</h2>
                <p className="text-xs text-slate-500 mt-1">
                  Create the specific sub-services or packages you want to offer to customers.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleOpenAddOffering}
                  disabled={!canCreateOffering}
                  className={`px-5 py-2.5 rounded-xl text-xs font-bold shadow-sm flex items-center justify-center gap-2 transition-all ${
                    canCreateOffering
                      ? 'bg-black hover:bg-slate-800 text-white cursor-pointer'
                      : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                  }`}
                  title={!canCreateOffering ? 'Complete and get your main service details approved first' : 'Create Sub-Service'}
                >
                  <Plus className="w-4 h-4" />
                  <span>+ Create Sub-Service</span>
                </button>
              </div>
            </div>"""

new_sec2_header = """          <section className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-5">
              <div>
                <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">MY VENDOR CATALOG & OFFERINGS</h2>
                <p className="text-xs text-slate-500 mt-1">
                  Manage your unlimited-depth catalog hierarchy, organize grouping nodes, and publish bookable offerings.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* View Mode Toggle */}
                <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => setViewMode('TREE')}
                    className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                      viewMode === 'TREE'
                        ? 'bg-white text-black shadow-sm'
                        : 'text-slate-600 hover:text-black'
                    }`}
                  >
                    <Folder className="w-3.5 h-3.5" />
                    <span>Catalog Explorer (Tree)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('GRID')}
                    className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                      viewMode === 'GRID'
                        ? 'bg-white text-black shadow-sm'
                        : 'text-slate-600 hover:text-black'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>Category Grid</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => handleOpenWizard(null, 'GROUPING')}
                  disabled={!canCreateOffering}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 shadow-sm flex items-center gap-1.5 transition-all"
                  title="Create a grouping node for organization"
                >
                  <Folder className="w-3.5 h-3.5" />
                  <span>+ Grouping Node</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleOpenWizard(null, 'BOOKABLE')}
                  disabled={!canCreateOffering}
                  className={`px-5 py-2.5 rounded-xl text-xs font-bold shadow-sm flex items-center justify-center gap-2 transition-all ${
                    canCreateOffering
                      ? 'bg-black hover:bg-slate-800 text-white cursor-pointer'
                      : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                  }`}
                  title={!canCreateOffering ? 'Complete and get your main service details approved first' : 'Add to Catalog Wizard'}
                >
                  <Plus className="w-4 h-4" />
                  <span>+ Add Offering (Wizard)</span>
                </button>
              </div>
            </div>

            {/* Vendor Catalog Dashboard Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-center">
                <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">Total Nodes</span>
                <span className="text-xl font-extrabold text-slate-900">{items.length}</span>
              </div>
              <div className="p-3.5 rounded-2xl bg-blue-50/60 border border-blue-200 text-center">
                <span className="text-[10px] font-extrabold text-blue-600 uppercase tracking-wider block">Bookable</span>
                <span className="text-xl font-extrabold text-blue-900">{items.filter((i) => i.node_type !== 'GROUPING').length}</span>
              </div>
              <div className="p-3.5 rounded-2xl bg-amber-50/60 border border-amber-200 text-center">
                <span className="text-[10px] font-extrabold text-amber-600 uppercase tracking-wider block">Groupings</span>
                <span className="text-xl font-extrabold text-amber-900">{items.filter((i) => i.node_type === 'GROUPING').length}</span>
              </div>
              <div className="p-3.5 rounded-2xl bg-emerald-50/60 border border-emerald-200 text-center">
                <span className="text-[10px] font-extrabold text-emerald-600 uppercase tracking-wider block">Approved</span>
                <span className="text-xl font-extrabold text-emerald-900">
                  {items.filter((i) => i.status === 'ACTIVE_IN_CATALOG' || i.status === 'APPROVED').length}
                </span>
              </div>
              <div className="p-3.5 rounded-2xl bg-yellow-50/60 border border-yellow-200 text-center">
                <span className="text-[10px] font-extrabold text-yellow-700 uppercase tracking-wider block">Pending</span>
                <span className="text-xl font-extrabold text-yellow-900">
                  {items.filter((i) => i.status === 'PENDING_ADMIN_APPROVAL' || i.status === 'PENDING').length}
                </span>
              </div>
              <div className="p-3.5 rounded-2xl bg-orange-50/60 border border-orange-200 text-center">
                <span className="text-[10px] font-extrabold text-orange-600 uppercase tracking-wider block">Changes Req</span>
                <span className="text-xl font-extrabold text-orange-900">
                  {items.filter((i) => i.status === 'CHANGES_REQUESTED').length}
                </span>
              </div>
              <div className="p-3.5 rounded-2xl bg-rose-50/60 border border-rose-200 text-center">
                <span className="text-[10px] font-extrabold text-rose-600 uppercase tracking-wider block">Rejected</span>
                <span className="text-xl font-extrabold text-rose-900">
                  {items.filter((i) => i.status === 'REJECTED').length}
                </span>
              </div>
              <div className="p-3.5 rounded-2xl bg-gray-50 border border-gray-200 text-center">
                <span className="text-[10px] font-extrabold text-gray-500 uppercase tracking-wider block">Drafts</span>
                <span className="text-xl font-extrabold text-gray-800">
                  {items.filter((i) => i.status === 'DRAFT').length}
                </span>
              </div>
            </div>"""

# 4. Integrate Tree View Rendering inside Section 2
old_sec2_body_start = """            {/* SUB-SERVICES LIST / GRID */}
            {items.length === 0 ? ("""

new_sec2_body_start = """            {/* SUB-SERVICES LIST / GRID / EXPLORER */}
            {viewMode === 'TREE' ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs text-slate-500 px-1">
                  <span>Hierarchical Catalog Tree (Unlimited Depth • Grouping 📁 & Bookable 📦)</span>
                  <span className="text-[11px] font-mono">{items.length} node(s) total</span>
                </div>
                <CatalogExplorerTree
                  items={items}
                  onAddChildGrouping={(parent) => handleOpenWizard(parent, 'GROUPING')}
                  onAddChildOffering={(parent) => handleOpenWizard(parent, 'BOOKABLE')}
                  onEditNode={(item) => handleOpenWizard(null, item.node_type || 'BOOKABLE', item)}
                  onMoveNode={(item) => {
                    setNodeToMove(item);
                    setMoveModalOpen(true);
                  }}
                  onReorderNode={handleReorderNode}
                  onArchiveNode={handleArchiveNode}
                  onPreviewNode={(item) => {
                    setPreviewItem(item);
                    setPreviewModalOpen(true);
                  }}
                />
              </div>
            ) : items.length === 0 ? ("""

# 5. Append modals at bottom before closing tag
old_footer = """      {/* Vendor Category Governance Modal */}
      <VendorCategoryGovernanceModal
        isOpen={governanceModalOpen}
        onClose={() => setGovernanceModalOpen(false)}
        currentUser={currentUser}
        categories={categories}
        userAssets={localUserAssets}
        onRefresh={loadData}
      />
    </div>"""

new_footer = """      {/* Vendor Category Governance Modal */}
      <VendorCategoryGovernanceModal
        isOpen={governanceModalOpen}
        onClose={() => setGovernanceModalOpen(false)}
        currentUser={currentUser}
        categories={categories}
        userAssets={localUserAssets}
        onRefresh={loadData}
      />

      {/* 9-Step Add / Edit Offering Wizard Modal */}
      <CatalogOfferingWizardModal
        isOpen={wizardModalOpen}
        onClose={() => setWizardModalOpen(false)}
        onSuccess={loadData}
        currentUser={currentUser}
        categories={categories}
        eligibleCategoryIds={eligibleMainServices.map((s) => s.categoryId)}
        existingCatalogNodes={items}
        initialParentNode={wizardInitialParent}
        initialNodeType={wizardInitialType}
        editingItem={editingItem}
      />

      {/* Catalog Move Node Modal */}
      <CatalogMoveNodeModal
        isOpen={moveModalOpen}
        onClose={() => {
          setMoveModalOpen(false);
          setNodeToMove(null);
        }}
        onSuccess={loadData}
        vendorUserId={currentUser.id}
        nodeToMove={nodeToMove}
        allItems={items}
      />

      {/* Catalog Item Preview Modal */}
      <CatalogItemPreviewModal
        isOpen={previewModalOpen}
        onClose={() => {
          setPreviewModalOpen(false);
          setPreviewItem(null);
        }}
        item={previewItem}
      />
    </div>"""

if is_crlf:
    old_import = old_import.replace('\n', '\r\n')
    new_import = new_import.replace('\n', '\r\n')
    old_state = old_state.replace('\n', '\r\n')
    new_state = new_state.replace('\n', '\r\n')
    old_sec2_header = old_sec2_header.replace('\n', '\r\n')
    new_sec2_header = new_sec2_header.replace('\n', '\r\n')
    old_sec2_body_start = old_sec2_body_start.replace('\n', '\r\n')
    new_sec2_body_start = new_sec2_body_start.replace('\n', '\r\n')
    old_footer = old_footer.replace('\n', '\r\n')
    new_footer = new_footer.replace('\n', '\r\n')

assert old_import in text, "old_import not found"
assert old_state in text, "old_state not found"
assert old_sec2_header in text, "old_sec2_header not found"
assert old_sec2_body_start in text, "old_sec2_body_start not found"
assert old_footer in text, "old_footer not found"

text = text.replace(old_import, new_import, 1)
text = text.replace(old_state, new_state, 1)
text = text.replace(old_sec2_header, new_sec2_header, 1)
text = text.replace(old_sec2_body_start, new_sec2_body_start, 1)
text = text.replace(old_footer, new_footer, 1)

with open(path, 'wb') as f:
    f.write(text.encode('utf-8'))
print("Successfully patched VendorCatalogManager.tsx")

