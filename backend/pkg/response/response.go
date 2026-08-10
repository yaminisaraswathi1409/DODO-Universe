package response

import (
	"encoding/json"
	"net/http"
)

type APIResponse struct {
	Success bool        `json:"success"`
	Code    int         `json:"code"`
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
	Error   interface{} `json:"error,omitempty"`
	Meta    interface{} `json:"meta,omitempty"`
}

func JSON(w http.ResponseWriter, statusCode int, message string, data interface{}, meta ...interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)

	resp := APIResponse{
		Success: statusCode >= 200 && statusCode < 300,
		Code:    statusCode,
		Message: message,
		Data:    data,
	}

	if len(meta) > 0 {
		resp.Meta = meta[0]
	}

	_ = json.NewEncoder(w).Encode(resp)
}

func Error(w http.ResponseWriter, statusCode int, message string, errDetail interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)

	resp := APIResponse{
		Success: false,
		Code:    statusCode,
		Message: message,
		Error:   errDetail,
	}

	_ = json.NewEncoder(w).Encode(resp)
}
