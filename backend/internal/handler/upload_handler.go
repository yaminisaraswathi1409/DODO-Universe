package handler

import (
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/uop/backend/internal/auth"
	"github.com/uop/backend/internal/authz"
	"github.com/uop/backend/pkg/response"
)

// Upload limits per file class.
const (
	maxImageBytes = 10 << 20
	maxPDFBytes   = 15 << 20
	maxVideoBytes = 50 << 20
	// maxRequestBytes bounds the whole multipart request (largest file + overhead).
	maxRequestBytes = maxVideoBytes + (1 << 20)

	privateURLPrefix = "/api/v1/files/private/"
	signedURLPrefix  = "/api/v1/files/signed/"
	signedURLTTL     = 5 * time.Minute
)

// Upload purposes accepted in the multipart field "purpose".
const (
	PurposeAuto        = ""
	PurposePublicImage = "public_image"
	PurposePrivate     = "private"
	PurposeKYC         = "kyc_document"
)

var privateNameRe = regexp.MustCompile(`^[0-9a-f]{32}\.(jpg|jpeg|png|webp|pdf|mp4|webm|mov)$`)

// UploadHandler stores uploads and serves private files.
//
//   - Public files (profile and catalog images, product videos) go to publicDir
//     and are served by the static /uploads route.
//   - Private files (KYC / identity / compliance documents, and every PDF by
//     default) go to privateDir/<owner-user-id>/<random>.<ext>, outside any
//     static route, and are only reachable through authorised downloads or
//     5-minute signed links.
type UploadHandler struct {
	publicDir  string
	privateDir string
	signer     *auth.FileSigner
}

// NewUploadHandler creates the handler and its directories. signer may be nil
// only when private files will not be served (signed links then fail closed).
func NewUploadHandler(publicDir, privateDir string, signer *auth.FileSigner) *UploadHandler {
	if publicDir == "" {
		publicDir = "./public/uploads"
	}
	if privateDir == "" {
		privateDir = "./private_uploads"
	}
	_ = os.MkdirAll(publicDir, 0o755)
	_ = os.MkdirAll(privateDir, 0o700)
	return &UploadHandler{publicDir: publicDir, privateDir: privateDir, signer: signer}
}

type FileUploadResult struct {
	URL       string `json:"url"`
	Filename  string `json:"filename"`
	MIMEType  string `json:"mimetype"`
	SizeBytes int64  `json:"size_bytes"`
	Private   bool   `json:"private"`
}

type fileClass int

const (
	classImage fileClass = iota
	classPDF
	classVideo
)

// validateUpload checks extension, size and the real content (magic bytes).
// The client-declared Content-Type and filename are never trusted on their own.
func validateUpload(ext string, head []byte, size int64) (fileClass, string, error) {
	ext = strings.ToLower(ext)
	sniffed := detectType(head)
	switch ext {
	case ".jpg", ".jpeg":
		if sniffed != "image/jpeg" {
			return 0, "", errors.New("file content is not a JPEG image")
		}
		return classImage, "image/jpeg", checkSize(size, maxImageBytes, "image")
	case ".png":
		if sniffed != "image/png" {
			return 0, "", errors.New("file content is not a PNG image")
		}
		return classImage, "image/png", checkSize(size, maxImageBytes, "image")
	case ".webp":
		if sniffed != "image/webp" {
			return 0, "", errors.New("file content is not a WEBP image")
		}
		return classImage, "image/webp", checkSize(size, maxImageBytes, "image")
	case ".pdf":
		if sniffed != "application/pdf" {
			return 0, "", errors.New("file content is not a PDF document")
		}
		return classPDF, "application/pdf", checkSize(size, maxPDFBytes, "PDF")
	case ".mp4":
		if sniffed != "video/mp4" {
			return 0, "", errors.New("file content is not an MP4 video")
		}
		return classVideo, "video/mp4", checkSize(size, maxVideoBytes, "video")
	case ".webm":
		if sniffed != "video/webm" {
			return 0, "", errors.New("file content is not a WEBM video")
		}
		return classVideo, "video/webm", checkSize(size, maxVideoBytes, "video")
	case ".mov":
		if !looksLikeQuickTime(head) && sniffed != "video/mp4" {
			return 0, "", errors.New("file content is not a QuickTime video")
		}
		return classVideo, "video/quicktime", checkSize(size, maxVideoBytes, "video")
	default:
		return 0, "", fmt.Errorf("unsupported file extension %q (allowed: JPG, PNG, WEBP, PDF, MP4, WEBM, MOV)", ext)
	}
}

func detectType(head []byte) string {
	t := http.DetectContentType(head)
	if i := strings.Index(t, ";"); i >= 0 {
		t = t[:i]
	}
	return t
}

func looksLikeQuickTime(head []byte) bool {
	if len(head) < 12 {
		return false
	}
	switch string(head[4:8]) {
	case "ftyp", "moov", "mdat", "wide", "free":
		return true
	}
	return false
}

func checkSize(size, max int64, label string) error {
	if size > max {
		return fmt.Errorf("%s files must be at most %d MB", label, max>>20)
	}
	return nil
}

// HandleFileUpload handles POST /api/v1/upload (authentication required).
func (h *UploadHandler) HandleFileUpload(w http.ResponseWriter, r *http.Request) {
	caller, err := authz.CurrentUser(r)
	if authz.Write(w, err) {
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxRequestBytes)
	if err := r.ParseMultipartForm(8 << 20); err != nil {
		response.Error(w, http.StatusBadRequest, "Upload too large or malformed", nil)
		return
	}
	if r.MultipartForm != nil {
		defer r.MultipartForm.RemoveAll() //nolint:errcheck
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		response.Error(w, http.StatusBadRequest, "Missing 'file' field in multipart form upload", nil)
		return
	}
	defer file.Close()

	head := make([]byte, 512)
	n, _ := io.ReadFull(file, head)
	head = head[:n]
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to read upload", nil)
		return
	}

	ext := strings.ToLower(filepath.Ext(header.Filename))
	class, mimeType, verr := validateUpload(ext, head, header.Size)
	if verr != nil {
		response.Error(w, http.StatusBadRequest, verr.Error(), nil)
		return
	}

	purpose := strings.ToLower(strings.TrimSpace(r.FormValue("purpose")))
	private, perr := decidePrivacy(purpose, class)
	if perr != nil {
		response.Error(w, http.StatusBadRequest, perr.Error(), nil)
		return
	}

	name := strings.ReplaceAll(uuid.NewString(), "-", "") + canonicalExt(ext)

	var dstPath, url string
	if private {
		ownerDir := filepath.Join(h.privateDir, caller.ID.String())
		if err := os.MkdirAll(ownerDir, 0o700); err != nil {
			response.Error(w, http.StatusInternalServerError, "Failed to store uploaded file", nil)
			return
		}
		dstPath = filepath.Join(ownerDir, name)
		url = privateURLPrefix + caller.ID.String() + "/" + name
	} else {
		dstPath = filepath.Join(h.publicDir, fmt.Sprintf("%d_%s", time.Now().UnixNano(), name))
		url = "/uploads/" + filepath.Base(dstPath)
	}

	dst, err := os.OpenFile(dstPath, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to store uploaded file", nil)
		return
	}
	defer dst.Close()
	if !private {
		_ = os.Chmod(dstPath, 0o644)
	}

	copied, err := io.Copy(dst, file)
	if err != nil {
		_ = os.Remove(dstPath)
		response.Error(w, http.StatusInternalServerError, "Failed writing file to disk", nil)
		return
	}

	response.JSON(w, http.StatusOK, "File uploaded successfully", FileUploadResult{
		URL:       url,
		Filename:  safeDisplayName(header.Filename),
		MIMEType:  mimeType,
		SizeBytes: copied,
		Private:   private,
	})
}

// decidePrivacy applies the storage policy. Documents (PDF) and anything
// declared as KYC/private are stored privately; images and videos are public
// unless explicitly marked private.
func decidePrivacy(purpose string, class fileClass) (bool, error) {
	switch purpose {
	case PurposeAuto:
		return class == classPDF, nil
	case PurposePublicImage:
		if class == classPDF {
			return false, errors.New("documents cannot be uploaded as public files")
		}
		return false, nil
	case PurposePrivate, PurposeKYC:
		return true, nil
	default:
		return false, fmt.Errorf("unknown upload purpose %q", purpose)
	}
}

func canonicalExt(ext string) string {
	if ext == ".jpeg" {
		return ".jpg"
	}
	return ext
}

func safeDisplayName(name string) string {
	name = filepath.Base(strings.ReplaceAll(name, "\\", "/"))
	if len(name) > 120 {
		name = name[:120]
	}
	return name
}

// resolvePrivatePath validates owner/name and returns the file path, which is
// guaranteed to stay inside privateDir (no traversal).
func (h *UploadHandler) resolvePrivatePath(owner, name string) (string, error) {
	if _, err := uuid.Parse(owner); err != nil {
		return "", errors.New("invalid file path")
	}
	if !privateNameRe.MatchString(name) {
		return "", errors.New("invalid file path")
	}
	base, err := filepath.Abs(h.privateDir)
	if err != nil {
		return "", err
	}
	full := filepath.Join(base, owner, name)
	rel, err := filepath.Rel(base, full)
	if err != nil || strings.HasPrefix(rel, "..") || filepath.IsAbs(rel) {
		return "", errors.New("invalid file path")
	}
	return full, nil
}

func (h *UploadHandler) authorizeOwner(w http.ResponseWriter, r *http.Request) (owner, name string, ok bool) {
	owner = chi.URLParam(r, "owner")
	name = chi.URLParam(r, "name")
	ownerID, err := uuid.Parse(owner)
	if err != nil {
		response.Error(w, http.StatusNotFound, "File not found", nil)
		return "", "", false
	}
	if _, err := authz.RequireSelfOrAdmin(r, ownerID); err != nil {
		// Do not reveal whether the file exists to other users.
		if errors.Is(err, authz.ErrUnauthenticated) {
			authz.Write(w, err)
		} else {
			response.Error(w, http.StatusNotFound, "File not found", nil)
		}
		return "", "", false
	}
	return owner, name, true
}

// ServePrivateFile handles GET /api/v1/files/private/{owner}/{name}: only the
// owner or an admin may download.
func (h *UploadHandler) ServePrivateFile(w http.ResponseWriter, r *http.Request) {
	owner, name, ok := h.authorizeOwner(w, r)
	if !ok {
		return
	}
	h.serve(w, r, owner, name)
}

// SignPrivateFile handles POST /api/v1/files/private/{owner}/{name}/signed-url
// and returns a 5-minute link usable without an Authorization header (for
// <img>/<a> in a browser). Only the owner or an admin may request one.
func (h *UploadHandler) SignPrivateFile(w http.ResponseWriter, r *http.Request) {
	owner, name, ok := h.authorizeOwner(w, r)
	if !ok {
		return
	}
	if h.signer == nil {
		response.Error(w, http.StatusServiceUnavailable, "Signed links are not configured", nil)
		return
	}
	path, err := h.resolvePrivatePath(owner, name)
	if err != nil {
		response.Error(w, http.StatusNotFound, "File not found", nil)
		return
	}
	if _, err := os.Stat(path); err != nil {
		response.Error(w, http.StatusNotFound, "File not found", nil)
		return
	}
	token := h.signer.Sign(owner, name, signedURLTTL)
	response.JSON(w, http.StatusOK, "Signed link created", map[string]interface{}{
		"url":        signedURLPrefix + token,
		"expires_in": int(signedURLTTL.Seconds()),
	})
}

// ServeSignedFile handles GET /api/v1/files/signed/{token} (public route; the
// HMAC signature and expiry are the authorisation).
func (h *UploadHandler) ServeSignedFile(w http.ResponseWriter, r *http.Request) {
	if h.signer == nil {
		response.Error(w, http.StatusNotFound, "File not found", nil)
		return
	}
	owner, name, err := h.signer.Verify(chi.URLParam(r, "token"))
	if err != nil {
		response.Error(w, http.StatusNotFound, "File not found", nil)
		return
	}
	h.serve(w, r, owner, name)
}

func (h *UploadHandler) serve(w http.ResponseWriter, r *http.Request, owner, name string) {
	path, err := h.resolvePrivatePath(owner, name)
	if err != nil {
		response.Error(w, http.StatusNotFound, "File not found", nil)
		return
	}
	f, err := os.Open(path)
	if err != nil {
		response.Error(w, http.StatusNotFound, "File not found", nil)
		return
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil || info.IsDir() {
		response.Error(w, http.StatusNotFound, "File not found", nil)
		return
	}

	ctype := mime.TypeByExtension(filepath.Ext(name))
	if ctype == "" {
		ctype = "application/octet-stream"
	}
	w.Header().Set("Content-Type", ctype)
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Cache-Control", "private, no-store")
	w.Header().Set("Content-Disposition", "inline; filename=\""+name+"\"")
	http.ServeContent(w, r, name, info.ModTime(), f)
}

// PublicFilesHandler serves the public upload directory without directory
// listings and with nosniff.
func PublicFilesHandler(dir string) http.Handler {
	fs := http.FileServer(noListingFS{http.Dir(dir)})
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		fs.ServeHTTP(w, r)
	})
}

type noListingFS struct{ fs http.FileSystem }

func (n noListingFS) Open(name string) (http.File, error) {
	f, err := n.fs.Open(name)
	if err != nil {
		return nil, err
	}
	info, err := f.Stat()
	if err != nil {
		f.Close()
		return nil, err
	}
	if info.IsDir() {
		f.Close()
		return nil, os.ErrNotExist
	}
	return f, nil
}
