package main

import (
	"log"
	"net/http"
	"time"
)

type capacityWeek struct {
	Start    string `json:"start"`
	Workdays int    `json:"workdays"`
}
type capacityPerson struct {
	ID          int       `json:"id"`
	Name        string    `json:"name"`
	WeeklyHours float64   `json:"weeklyHours"`
	Allocated   []float64 `json:"allocated"`
}

// Inclusive dates; Monday weeks and weekday hours. Boundary weeks are clipped.
func (s *server) handleCapacity(w http.ResponseWriter, r *http.Request) {
	from, errFrom := time.Parse(time.DateOnly, r.URL.Query().Get("from"))
	to, errTo := time.Parse(time.DateOnly, r.URL.Query().Get("to"))
	if errFrom != nil || errTo != nil || from.Year() < 1 || to.Year() > 9999 || to.Before(from) || to.Sub(from) > 731*24*time.Hour {
		writeJSON(w, 400, map[string]string{"error": "Choose valid from/to dates in order, no more than two years apart."})
		return
	}
	weeks := []capacityWeek{}
	monday := from.AddDate(0, 0, -(int(from.Weekday())+6)%7)
	for start := monday; !start.After(to); start = start.AddDate(0, 0, 7) {
		days := 0
		for d := start; d.Before(start.AddDate(0, 0, 5)); d = d.AddDate(0, 0, 1) {
			if !d.Before(from) && !d.After(to) {
				days++
			}
		}
		weeks = append(weeks, capacityWeek{Start: start.Format(time.DateOnly), Workdays: days})
	}
	// Expand only requested days, never entire assignment lifetimes. Each assignment
	// record contributes independently, even when its values match another record.
	rows, err := s.db.Query(r.Context(), `
  WITH days AS (
   SELECT d::date AS day, date_trunc('week', d)::date AS week
   FROM generate_series($1::date::timestamp, $2::date::timestamp, interval '1 day') d
   WHERE extract(isodow FROM d) <= 5
  ), allocated AS (
   SELECT a.person_id, d.week, sum(a.hours_per_day) AS hours
   FROM assignments a JOIN days d ON d.day BETWEEN a.start_date AND a.end_date
   WHERE a.start_date <= $2::date AND a.end_date >= $1::date
   GROUP BY a.person_id, d.week
  ), weeks AS (
   SELECT generate_series(date_trunc('week', $1::date)::timestamp,
    date_trunc('week', $2::date)::timestamp, interval '1 week')::date AS week
  )
  SELECT p.id, p.name, p.weekly_hours::float8, coalesce(a.hours, 0)::float8
  FROM people p CROSS JOIN weeks w
  LEFT JOIN allocated a ON a.person_id = p.id AND a.week = w.week
  ORDER BY p.id, w.week`, from.Format(time.DateOnly), to.Format(time.DateOnly))
	if err != nil {
		log.Printf("capacity query: %v", err)
		writeJSON(w, 500, map[string]string{"error": "Could not load capacity. Please retry."})
		return
	}
	defer rows.Close()
	people := []capacityPerson{}
	for rows.Next() {
		var id int
		var name string
		var weekly, allocated float64
		if err := rows.Scan(&id, &name, &weekly, &allocated); err != nil {
			log.Printf("capacity scan: %v", err)
			writeJSON(w, 500, map[string]string{"error": "Could not load capacity. Please retry."})
			return
		}
		if len(people) == 0 || people[len(people)-1].ID != id {
			people = append(people, capacityPerson{ID: id, Name: name, WeeklyHours: weekly, Allocated: []float64{}})
		}
		p := &people[len(people)-1]
		p.Allocated = append(p.Allocated, allocated)
	}
	if err := rows.Err(); err != nil {
		log.Printf("capacity rows: %v", err)
		writeJSON(w, 500, map[string]string{"error": "Could not load capacity. Please retry."})
		return
	}
	writeJSON(w, 200, map[string]any{"from": from.Format(time.DateOnly), "to": to.Format(time.DateOnly), "weeks": weeks, "people": people})
}
