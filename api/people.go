package main

import (
	"encoding/json"
	"errors"
	"github.com/jackc/pgx/v5"
	"io"
	"log"
	"math"
	"net/http"
	"strconv"
)

func (s *server) handleUpdatePerson(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil || id <= 0 {
		writeJSON(w, 400, map[string]string{"error": "Invalid person ID."})
		return
	}
	var body struct {
		WeeklyHours *float64 `json:"weeklyHours"`
	}
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1024))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&body); err != nil {
		writeJSON(w, 400, map[string]string{"error": "Provide weeklyHours as a number."})
		return
	}
	if decoder.Decode(&struct{}{}) != io.EOF || body.WeeklyHours == nil || math.IsNaN(*body.WeeklyHours) || math.IsInf(*body.WeeklyHours, 0) || *body.WeeklyHours < 0 || *body.WeeklyHours > 168 {
		writeJSON(w, 400, map[string]string{"error": "Weekly hours must be between 0 and 168."})
		return
	}
	var hours float64
	err = s.db.QueryRow(r.Context(), `UPDATE people SET weekly_hours = $1 WHERE id = $2 RETURNING weekly_hours::float8`, *body.WeeklyHours, id).Scan(&hours)
	if errors.Is(err, pgx.ErrNoRows) {
		writeJSON(w, 404, map[string]string{"error": "Person not found."})
		return
	}
	if err != nil {
		log.Printf("update person: %v", err)
		writeJSON(w, 500, map[string]string{"error": "Could not save weekly hours. Please retry."})
		return
	}
	writeJSON(w, 200, map[string]any{"id": id, "weeklyHours": hours})
}
