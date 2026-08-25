package handler

import (
	"fmt"
	"io"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/uop/backend/pkg/response"
)

type UploadHandler struct {
	uploadDir string
}

func NewUploadHandler(uploadDir string) *UploadHandler {
	if uploadDir == "" {
		uploadDir = "./public/uploads"
	}
	// Ensure upload directory exists
	_ = os.MkdirAll(uploadDir, 0755)
	return &UploadHandler{uploadDir: uploadDir}
}

type FileUploadResult struct {
	URL       string `json:"url"`
	Filename  string `json:"filename"`
	MIMEType  string `json:"mimetype"`
	SizeBytes int64  `json:"size_bytes"`
}

func (h *UploadHandler) HandleFileUpload(w http.ResponseWriter, r *http.Request) {
	// Parse max 50MB multipart form
	if err := r.ParseMultipartForm(50 << 20); err != nil {
		response.Error(w, http.StatusBadRequest, "File size exceeds maximum limit of 50MB", err.Error())
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		response.Error(w, http.StatusBadRequest, "Missing 'file' field in multipart form upload", err.Error())
		return
	}
	defer file.Close()

	ext := strings.ToLower(filepath.Ext(header.Filename))
	allowedExts := map[string]bool{
		".jpg": true, ".jpeg": true, ".png": true, ".webp": true,
		".pdf": true,
		".mp4": true, ".webm": true, ".mov": true,
	}

	if !allowedExts[ext] {
		response.Error(w, http.StatusBadRequest, fmt.Sprintf("Unsupported file extension '%s'. Allowed: JPG, PNG, WEBP, PDF, MP4, WEBM, MOV", ext), nil)
		return
	}

	mimeType := mime.TypeByExtension(ext)
	if mimeType == "" {
		mimeType = header.Header.Get("Content-Type")
	}

	newFilename := fmt.Sprintf("%d_%s%s", time.Now().UnixNano(), uuid.New().String()[:8], ext)
	dstPath := filepath.Join(h.uploadDir, newFilename)

	dst, err := os.Create(dstPath)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to store uploaded file on server", err.Error())
		return
	}
	defer dst.Close()

	copied, err := io.Copy(dst, file)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed writing file bytes to disk", err.Error())
		return
	}

	fileURL := fmt.Sprintf("/uploads/%s", newFilename)

	result := FileUploadResult{
		URL:       fileURL,
		Filename:  header.Filename,
		MIMEType:  mimeType,
		SizeBytes: copied,
	}

	response.JSON(w, http.StatusOK, "File uploaded successfully", result)
}
