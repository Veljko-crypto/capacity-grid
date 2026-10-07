"""Run against docker compose up: python tests/verify_api.py.
Compares every person's totals with an independent Decimal seed calculation.
"""
import json
from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from time import perf_counter

BASE = 'http://localhost:8080/api'
def call(path, body=None, status=200):
    req = Request(BASE + path, data=body.encode() if body is not None else None,
                  method='PATCH' if body is not None else 'GET', headers={'Content-Type': 'application/json'})
    try:
        with urlopen(req) as response:
            assert response.status == status
            return json.load(response)
    except HTTPError as error:
        assert error.code == status, (error.code, status)
        return json.load(error)

assignments = []
section = None
for line in (Path(__file__).resolve().parents[1] / 'db/seed.sql').open(encoding='utf-8'):
    if line.startswith('COPY '): section = line.split()[1]; continue
    if line.strip() == r'\.': section = None; continue
    if section == 'public.assignments':
        _, person, _, start, end, hours = line.rstrip().split('\t')
        assignments.append((int(person), date.fromisoformat(start), date.fromisoformat(end), Decimal(hours)))

for start, end in [('2025-12-29', '2026-01-16'), ('2026-01-07', '2026-01-13'), ('2026-01-10', '2026-01-11'), ('2028-01-01', '2028-01-04')]:
    result = call(f'/capacity?from={start}&to={end}')
    a, b = date.fromisoformat(start), date.fromisoformat(end)
    expected = defaultdict(Decimal)
    for person, first, last, hours in assignments:
        d = max(a, first)
        while d <= min(b, last):
            if d.weekday() < 5: expected[person, (d-timedelta(days=d.weekday())).isoformat()] += hours
            d += timedelta(days=1)
    assert len(result['people']) == 500
    for person in result['people']:
        for i, week in enumerate(result['weeks']):
            assert Decimal(str(person['allocated'][i])) == expected[person['id'], week['start']], (person, week)
    for week in result['weeks']:
        monday = date.fromisoformat(week['start'])
        assert week['workdays'] == sum(a <= monday+timedelta(days=i) <= b for i in range(5))
    print('All 500 people match independent seed totals:', start, end)

for path in ['/capacity', '/capacity?from=2026-02-30&to=2026-03-01', '/capacity?from=2026-01-02&to=2026-01-01', '/capacity?from=2020-01-01&to=2026-01-01']:
    call(path, status=400)
for body in ['{}', '{"weeklyHours":null}', '{"weeklyHours":-1}', '{"weeklyHours":169}', '{"weeklyHours":"40"}', '{"weeklyHours":40,"other":1}', '{"weeklyHours":40} {}']:
    call('/people/1', body, 400)
call('/people/no', '{"weeklyHours":40}', 400)
call('/people/999999', '{"weeklyHours":40}', 404)
original = call('/capacity?from=2026-01-05&to=2026-01-09')['people'][0]['weeklyHours']
try:
    for hours in [0, 32.5]:
        assert call('/people/1', json.dumps({'weeklyHours': hours}))['weeklyHours'] == hours
        assert call('/capacity?from=2026-01-05&to=2026-01-09')['people'][0]['weeklyHours'] == hours
finally:
    call('/people/1', json.dumps({'weeklyHours': original}))
start = perf_counter()
result = call('/capacity?from=2025-01-01&to=2027-01-01')
print('Two-year range:', len(result['weeks']), 'weeks;', round(perf_counter()-start, 3), 'seconds')
print('Validation, zero/fractional-hour saves and persistence passed; original hours restored.')
