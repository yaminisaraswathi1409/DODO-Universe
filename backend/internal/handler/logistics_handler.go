package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/uop/backend/internal/domain"
	"github.com/uop/backend/internal/service"
	"github.com/uop/backend/pkg/response"
)

type LogisticsHandler struct {
	logisticsService *service.LogisticsService
}

func NewLogisticsHandler(logisticsService *service.LogisticsService) *LogisticsHandler {
	return &LogisticsHandler{
		logisticsService: logisticsService,
	}
}

// 1. Voice NLU Entity Parser Handler
func (h *LogisticsHandler) ParseVoice(w http.ResponseWriter, r *http.Request) {
	var req domain.VoiceParseRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid voice request body", err.Error())
		return
	}

	res, err := h.logisticsService.ParseVoiceOrder(r.Context(), &req)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to parse voice order", err.Error())
		return
	}

	response.JSON(w, http.StatusOK, "Voice order parsed successfully", res)
}

// 2. Cascade Spawning Handler
type CascadePayload struct {
	RootOpportunityID string  `json:"root_opportunity_id"`
	CascadeType       string  `json:"cascade_type"` // TRANSPORT, DRIVER, PARTS
	ParentUserID      string  `json:"parent_user_id"`
	Lat               float64 `json:"lat"`
	Lng               float64 `json:"lng"`
	PartNumber        string  `json:"part_number"`
}

func (h *LogisticsHandler) TriggerCascade(w http.ResponseWriter, r *http.Request) {
	var p CascadePayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid cascade payload", err.Error())
		return
	}

	rootID, err := uuid.Parse(p.RootOpportunityID)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid root_opportunity_id", err.Error())
		return
	}

	userID, err := uuid.Parse(p.ParentUserID)
	if err != nil {
		userID = uuid.New()
	}

	var created *domain.Opportunity
	switch p.CascadeType {
	case "TRANSPORT":
		created, err = h.logisticsService.SpawnTransportCascade(r.Context(), rootID, userID, p.Lat, p.Lng)
	case "DRIVER":
		created, err = h.logisticsService.SpawnDriverCascade(r.Context(), rootID, userID)
	case "PARTS":
		created, err = h.logisticsService.RegisterPartsProcurementCascade(r.Context(), rootID, userID, p.PartNumber)
	default:
		response.Error(w, http.StatusBadRequest, "Unknown cascade_type", nil)
		return
	}

	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to trigger cascade", err.Error())
		return
	}

	response.JSON(w, http.StatusCreated, "Cascade opportunity spawned successfully", created)
}

// 3. SOS Incident Handler
type SOSPayload struct {
	OpportunityID string  `json:"opportunity_id"`
	ReporterID    string  `json:"reporter_id"`
	Description   string  `json:"description"`
	Lat           float64 `json:"lat"`
	Lng           float64 `json:"lng"`
}

func (h *LogisticsHandler) ReportSOSIncident(w http.ResponseWriter, r *http.Request) {
	var p SOSPayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid SOS payload", err.Error())
		return
	}

	oppID, err := uuid.Parse(p.OpportunityID)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid opportunity_id", err.Error())
		return
	}

	reporterID, err := uuid.Parse(p.ReporterID)
	if err != nil {
		reporterID = uuid.New()
	}

	inc, repairChild, err := h.logisticsService.RegisterSOSIncident(r.Context(), oppID, reporterID, p.Description, p.Lat, p.Lng)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to register SOS incident", err.Error())
		return
	}

	response.JSON(w, http.StatusOK, "SOS Breakdown Incident registered. Emergency mechanic child opportunity spawned.", map[string]interface{}{
		"incident":              inc,
		"roadside_repair_child": repairChild,
	})
}

// 4. Way Manifest Handlers
type ManifestPayload struct {
	OpportunityID string  `json:"opportunity_id"`
	VehicleID     *string `json:"vehicle_id"`
	DriverID      *string `json:"driver_id"`
}

func (h *LogisticsHandler) GenerateWayManifest(w http.ResponseWriter, r *http.Request) {
	var p ManifestPayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid manifest payload", err.Error())
		return
	}

	oppID, err := uuid.Parse(p.OpportunityID)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid opportunity_id", err.Error())
		return
	}

	var vID, dID *uuid.UUID
	if p.VehicleID != nil {
		if parsed, err := uuid.Parse(*p.VehicleID); err == nil {
			vID = &parsed
		}
	}
	if p.DriverID != nil {
		if parsed, err := uuid.Parse(*p.DriverID); err == nil {
			dID = &parsed
		}
	}

	manifest, err := h.logisticsService.GenerateWayManifest(r.Context(), oppID, vID, dID)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to generate manifest", err.Error())
		return
	}

	response.JSON(w, http.StatusCreated, "Manifest generated successfully", manifest)
}

type POLPayload struct {
	OpportunityID string `json:"opportunity_id"`
	PhotoURL      string `json:"photo_url"`
}

func (h *LogisticsHandler) UploadPOL(w http.ResponseWriter, r *http.Request) {
	var p POLPayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid POL payload", err.Error())
		return
	}

	oppID, err := uuid.Parse(p.OpportunityID)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid opportunity_id", err.Error())
		return
	}

	manifest, err := h.logisticsService.UpdatePOL(r.Context(), oppID, p.PhotoURL)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to update POL", err.Error())
		return
	}

	response.JSON(w, http.StatusOK, "Proof of Loading (PoL) verified", manifest)
}

type PODPayload struct {
	OpportunityID string `json:"opportunity_id"`
	QRCode        string `json:"qr_code"`
	SignatureURL  string `json:"signature_url"`
}

func (h *LogisticsHandler) UploadPOD(w http.ResponseWriter, r *http.Request) {
	var p PODPayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid POD payload", err.Error())
		return
	}

	oppID, err := uuid.Parse(p.OpportunityID)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid opportunity_id", err.Error())
		return
	}

	manifest, err := h.logisticsService.UpdatePOD(r.Context(), oppID, p.QRCode, p.SignatureURL)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to update POD", err.Error())
		return
	}

	response.JSON(w, http.StatusOK, "Proof of Delivery (PoD) verified. Opportunity completed.", manifest)
}

// 5. Parts Inventory Search
func (h *LogisticsHandler) SearchParts(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query().Get("q")
	if query == "" {
		query = "TC-990"
	}

	items, err := h.logisticsService.SearchParts(r.Context(), query)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to search parts", err.Error())
		return
	}

	response.JSON(w, http.StatusOK, "Parts inventory search results", items)
}

// 6. Parts Checkout Handler
type CheckoutPartPayload struct {
	PartID  string `json:"part_id"`
	BuyerID string `json:"buyer_id"`
	RootID  string `json:"root_id"`
}

func (h *LogisticsHandler) CheckoutPart(w http.ResponseWriter, r *http.Request) {
	var p CheckoutPartPayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid checkout payload", err.Error())
		return
	}

	partID, _ := uuid.Parse(p.PartID)
	buyerID, _ := uuid.Parse(p.BuyerID)
	rootID, _ := uuid.Parse(p.RootID)
	if partID == uuid.Nil {
		partID = uuid.New()
	}

	item, err := h.logisticsService.CheckoutPart(r.Context(), partID, buyerID, rootID)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to check out part", err.Error())
		return
	}

	response.JSON(w, http.StatusOK, "Part checked out and micro-escrow logged", item)
}

// 7. Vehicle Driver Pairing Handler
type PairingPayload struct {
	VehicleID     string `json:"vehicle_id"`
	DriverID      string `json:"driver_id"`
	LicenseNumber string `json:"license_number"`
	LicenseClass  string `json:"license_class"`
}

func (h *LogisticsHandler) CreateVehicleDriverPairing(w http.ResponseWriter, r *http.Request) {
	var p PairingPayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid pairing payload", err.Error())
		return
	}

	vehicleID, err := uuid.Parse(p.VehicleID)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid vehicle_id", err.Error())
		return
	}
	driverID, err := uuid.Parse(p.DriverID)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid driver_id", err.Error())
		return
	}

	pairing, err := h.logisticsService.CreateVehicleDriverPairing(r.Context(), vehicleID, driverID, p.LicenseNumber, p.LicenseClass)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to create vehicle driver pairing", err.Error())
		return
	}

	response.JSON(w, http.StatusCreated, "Vehicle-driver pairing created successfully", pairing)
}

// 8. Escrow Settlement Handler
func (h *LogisticsHandler) SettleEscrow(w http.ResponseWriter, r *http.Request) {
	rootIDStr := chi.URLParam(r, "root_id")
	rootID, err := uuid.Parse(rootIDStr)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid root_id", err.Error())
		return
	}

	if err := h.logisticsService.SettleTree(r.Context(), rootID); err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to settle escrow tree", err.Error())
		return
	}

	response.JSON(w, http.StatusOK, "Escrow ledger settled successfully across opportunity tree", nil)
}

// 9. Full Opportunity Tree Fetcher
func (h *LogisticsHandler) GetTree(w http.ResponseWriter, r *http.Request) {
	oppIDStr := chi.URLParam(r, "id")
	oppID, err := uuid.Parse(oppIDStr)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid opportunity id", err.Error())
		return
	}

	tree, err := h.logisticsService.GetTree(r.Context(), oppID)
	if err != nil {
		response.Error(w, http.StatusNotFound, "Opportunity tree not found", err.Error())
		return
	}

	response.JSON(w, http.StatusOK, "Opportunity tree fetched successfully", tree)
}
