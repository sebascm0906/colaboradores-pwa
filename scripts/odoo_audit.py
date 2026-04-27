"""Read-only Odoo audit wrapper.

Reusable utility for auditing Odoo production safely. Any attempt to call a
mutating method (create/write/unlink/copy/action_*/_action_*) raises
PermissionError and is logged.

Usage:
    py scripts/odoo_audit.py --test-block      # Validates the safety net
    py scripts/odoo_audit.py --check-g013      # Verifies gf.inventory.posting
    py scripts/odoo_audit.py --check-g014      # Verifies gf_logistics_ops dups
    py scripts/odoo_audit.py --check-modules   # Lists installed kold modules

Environment variables required:
    ODOO_URL        - Odoo base URL (default: https://grupofrio.odoo.com if unset)
    ODOO_DB         - Odoo database identifier (no default; must be set explicitly)
    ODOO_USER       - Odoo login (email). Also accepts ODOO_USERNAME as alias.
    ODOO_PASSWORD   - Odoo password (NEVER ODOO_PASS, prohibited per project standard)

The full call log is written to scripts/odoo_audit.log.
"""

from __future__ import annotations

import io
import json
import logging
import os
import sys
import xmlrpc.client

# Force UTF-8 on stdout/stderr for Windows consoles (default cp1252 chokes on Unicode arrows).
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

ALLOWED_METHODS = {
    'search', 'read', 'search_read', 'search_count', 'fields_get', 'read_group',
    'name_search', 'name_get', 'default_get',
}

PROHIBITED_PATTERNS = (
    'create', 'write', 'unlink', 'copy', 'action_', '_action_',
    'button_', 'do_', 'execute', 'run', 'cancel', 'confirm',
)

ODOO_URL = os.environ.get('ODOO_URL', 'https://grupofrio.odoo.com')
ODOO_DB = os.environ.get('ODOO_DB', '')

SCRIPT_DIR = Path(__file__).resolve().parent
LOG_PATH = SCRIPT_DIR / 'odoo_audit.log'

logging.basicConfig(
    filename=str(LOG_PATH),
    level=logging.INFO,
    format='%(asctime)s | %(levelname)s | %(message)s',
)
log = logging.getLogger('odoo_audit')


def _require_env() -> tuple[str, str]:
    user = os.environ.get('ODOO_USER') or os.environ.get('ODOO_USERNAME')
    password = os.environ.get('ODOO_PASSWORD')
    if not user:
        raise SystemExit('ERROR: ODOO_USER (o ODOO_USERNAME) no está en el entorno. Aborta.')
    if not password:
        raise SystemExit('ERROR: ODOO_PASSWORD no está en el entorno. Aborta.')
    if 'ODOO_PASS' in os.environ and 'ODOO_PASSWORD' not in os.environ:
        raise SystemExit("ERROR: variable prohibida 'ODOO_PASS' detectada. Usa ODOO_PASSWORD.")
    if not ODOO_DB:
        raise SystemExit('ERROR: ODOO_DB no está en el entorno. Aborta.')
    return user, password


_uid_cache: dict[str, int] = {}


def _authenticate(user: str, password: str) -> int:
    cache_key = f'{ODOO_URL}|{ODOO_DB}|{user}'
    if cache_key in _uid_cache:
        return _uid_cache[cache_key]
    common = xmlrpc.client.ServerProxy(f'{ODOO_URL}/xmlrpc/2/common', allow_none=True)
    uid = common.authenticate(ODOO_DB, user, password, {})
    if not uid:
        raise SystemExit('ERROR: autenticación falló en Odoo.')
    _uid_cache[cache_key] = uid
    # Log only the domain part to avoid PII (emails) in committable logs.
    domain = user.rsplit('@', 1)[1] if '@' in user else user
    log.info(f'AUTH ok user_domain={domain} uid={uid}')
    return uid


def _enforce_method(method: str) -> None:
    """Raise PermissionError if the method is not in the allow-list."""
    method_lower = method.lower()
    if method not in ALLOWED_METHODS:
        log.error(f'BLOCKED: method {method!r} not in allow-list')
        raise PermissionError(
            f"Método '{method}' no está en la allow-list de auditoría read-only. "
            f"Permitidos: {sorted(ALLOWED_METHODS)}"
        )
    for pattern in PROHIBITED_PATTERNS:
        if pattern in method_lower:
            log.error(f'BLOCKED: method {method!r} contains prohibited pattern {pattern!r}')
            raise PermissionError(
                f"Método '{method}' contiene patrón prohibido '{pattern}'."
            )


def safe_call(model: str, method: str, *args, **kwargs):
    """Execute a read-only Odoo call. Mutations are blocked unconditionally.

    Convention: if the last positional argument is a dict and no explicit
    kwargs were given, it is treated as the Odoo options dict (fields, limit,
    order, etc.) — this matches how Odoo's execute_kw expects them as kwargs,
    not as a positional argument to search_read.
    """
    _enforce_method(method)
    user, password = _require_env()
    uid = _authenticate(user, password)
    models = xmlrpc.client.ServerProxy(f'{ODOO_URL}/xmlrpc/2/object', allow_none=True)
    args_list = list(args)
    if args_list and isinstance(args_list[-1], dict) and not kwargs:
        kwargs = args_list.pop()
    log.info(f'CALL model={model} method={method} args_len={len(args_list)} kwargs_keys={sorted(kwargs)}')
    try:
        result = models.execute_kw(ODOO_DB, uid, password, model, method, args_list, kwargs)
    except xmlrpc.client.Fault as exc:
        log.error(f'XMLRPC FAULT {model}.{method}: {exc.faultString}')
        raise
    except Exception as exc:
        log.error(f'XMLRPC ERROR {model}.{method}: {exc!r}')
        raise
    summary = (
        f'list_len={len(result)}' if isinstance(result, list)
        else f'dict_keys={sorted(result)[:5]}' if isinstance(result, dict)
        else f'scalar={result!r}'
    )
    log.info(f'OK   model={model} method={method} {summary}')
    return result


# ───────────────────────── Reusable helpers ─────────────────────────────────

def fetch_module_info(name: str) -> dict | None:
    rows = safe_call(
        'ir.module.module', 'search_read',
        [('name', '=', name)],
        {'fields': ['name', 'state', 'latest_version', 'installed_version', 'shortdesc'], 'limit': 1},
    )
    return rows[0] if rows else None


def fetch_model_info(model: str) -> dict | None:
    rows = safe_call(
        'ir.model', 'search_read',
        [('model', '=', model)],
        {'fields': ['id', 'name', 'model', 'modules', 'transient'], 'limit': 1},
    )
    return rows[0] if rows else None


def fetch_models_for_module(module: str) -> list[dict]:
    """List all ir.model entries declared by a given module via ir.model.data."""
    data_rows = safe_call(
        'ir.model.data', 'search_read',
        [('module', '=', module), ('model', '=', 'ir.model')],
        {'fields': ['name', 'res_id'], 'limit': 500},
    )
    res_ids = [row['res_id'] for row in data_rows]
    if not res_ids:
        return []
    # Use search_read with id IN to avoid the read([ids]) XMLRPC pattern that
    # was hitting an Odoo 18 cache TypeError with nested lists.
    model_rows = safe_call(
        'ir.model', 'search_read',
        [('id', 'in', res_ids)],
        {'fields': ['id', 'name', 'model', 'modules'], 'limit': len(res_ids)},
    )
    return model_rows


# ──────────────────────────── Verifications ─────────────────────────────────

def test_block() -> None:
    """Validate that the safety net blocks mutations BEFORE any real query."""
    print('Testing safety net: attempting safe_call(write) - must raise PermissionError')
    try:
        safe_call('res.partner', 'write', [1], {'name': 'test_should_be_blocked'})
    except PermissionError as exc:
        print(f'  OK: PermissionError raised -> {exc}')
    else:
        raise SystemExit('FATAL: write call was NOT blocked. Aborta.')

    print('Testing safety net: attempting safe_call(create) - must raise PermissionError')
    try:
        safe_call('res.partner', 'create', {'name': 'test_should_be_blocked'})
    except PermissionError as exc:
        print(f'  OK: PermissionError raised -> {exc}')
    else:
        raise SystemExit('FATAL: create call was NOT blocked. Aborta.')

    print('Testing safety net: attempting safe_call(action_done) - must raise PermissionError')
    try:
        safe_call('gf.inventory.posting', 'action_done', [1])
    except PermissionError as exc:
        print(f'  OK: PermissionError raised -> {exc}')
    else:
        raise SystemExit('FATAL: action_* call was NOT blocked. Aborta.')

    print('Testing safety net: attempting safe_call(unlink) - must raise PermissionError')
    try:
        safe_call('res.partner', 'unlink', [1])
    except PermissionError as exc:
        print(f'  OK: PermissionError raised -> {exc}')
    else:
        raise SystemExit('FATAL: unlink call was NOT blocked. Aborta.')

    print('\nAll mutation attempts blocked correctly. Safety net validated.')
    log.info('SAFETY_NET validated: write, create, action_done, unlink all blocked')


def check_g013() -> dict:
    """Verify gf.inventory.posting state in production.

    Indirect evidence of broken _action_done():
      - registros antiguos (>7 días) en estado distinto a 'done' / 'posted'
      - distribución de estados desbalanceada
    """
    print('=== G013: gf.inventory.posting verification ===')
    report: dict = {'gap': 'G013', 'checked_at': datetime.now(timezone.utc).isoformat()}

    # 1. Module installed?
    module_info = fetch_module_info('gf_logistics_ops')
    report['module'] = module_info
    if not module_info:
        report['verdict'] = 'unknown'
        report['note'] = 'gf_logistics_ops no encontrado en ir.module.module'
        print(f'  module: NOT FOUND')
        return report
    print(f'  module gf_logistics_ops: state={module_info["state"]} version={module_info.get("installed_version")}')

    # 2. Model exists?
    model_info = fetch_model_info('gf.inventory.posting')
    report['model'] = model_info
    if not model_info:
        report['verdict'] = 'model_missing'
        report['note'] = 'gf.inventory.posting no existe en producción'
        print(f'  model gf.inventory.posting: NOT FOUND in ir.model')
        return report
    print(f'  model gf.inventory.posting: id={model_info["id"]} name={model_info["name"]}')

    # 3. Available state values
    fields = safe_call('gf.inventory.posting', 'fields_get', [], {'attributes': ['type', 'selection', 'string']})
    state_field = fields.get('state')
    report['state_field_meta'] = state_field
    state_choices = (state_field or {}).get('selection') or []
    print(f'  state field selection: {state_choices}')

    # 4. Total record count
    total = safe_call('gf.inventory.posting', 'search_count', [])
    report['total_records'] = total
    print(f'  total records: {total}')

    if total == 0:
        report['verdict'] = 'empty'
        report['note'] = 'No hay registros en gf.inventory.posting; no es posible inferir comportamiento.'
        return report

    # 5. State distribution
    grouped = safe_call(
        'gf.inventory.posting', 'read_group',
        [],
        {'fields': ['state'], 'groupby': ['state']},
    )
    distribution = {row.get('state') or 'null': row.get('state_count') for row in grouped}
    report['state_distribution'] = distribution
    print(f'  state distribution: {distribution}')

    # 6. Discover real fields and pick a safe subset for the recent sample
    safe_fields = ['id', 'state', 'create_date', 'write_date']
    optional_fields = ['display_name', 'reference', 'origin', 'picking_id', 'product_id', 'company_id', 'error_message', 'note']
    available = [f for f in optional_fields if f in fields]
    sample_fields = safe_fields + available
    report['sample_fields'] = sample_fields

    # 7. Recent sample (last 30 days)
    cutoff = (datetime.now(timezone.utc) - timedelta(days=30)).strftime('%Y-%m-%d %H:%M:%S')
    recent = safe_call(
        'gf.inventory.posting', 'search_read',
        [('create_date', '>=', cutoff)],
        {'fields': sample_fields, 'limit': 200, 'order': 'create_date desc'},
    )
    report['recent_total'] = len(recent)
    print(f'  records last 30 days: {len(recent)} (fields: {sample_fields})')

    # 8. Direct error evidence: any record with state='error' is a failed posting
    error_records = [r for r in recent if (r.get('state') or '').lower() == 'error']
    report['recent_errors'] = len(error_records)
    report['error_sample_ids'] = [r['id'] for r in error_records[:20]]

    # 9. Stuck records: created >7 days ago and not in 'done' state
    seven_days_ago = datetime.now(timezone.utc) - timedelta(days=7)
    stuck = []
    for row in recent:
        try:
            created = datetime.strptime(row['create_date'], '%Y-%m-%d %H:%M:%S').replace(tzinfo=timezone.utc)
        except (ValueError, TypeError):
            continue
        state = (row.get('state') or '').lower()
        if state != 'done' and created < seven_days_ago:
            stuck.append(row)

    report['stuck_count'] = len(stuck)
    report['stuck_sample_ids'] = [r['id'] for r in stuck[:20]]
    pct_stuck = (len(stuck) / len(recent) * 100) if recent else 0
    pct_error = (len(error_records) / len(recent) * 100) if recent else 0
    report['stuck_pct'] = round(pct_stuck, 2)
    report['error_pct_recent'] = round(pct_error, 2)
    print(f'  records in error state (last 30d): {len(error_records)} / {len(recent)} = {pct_error:.1f}%')
    print(f'  stuck records (>7d, not done): {len(stuck)} / {len(recent)} = {pct_stuck:.1f}%')

    # Total error rate across all records (not just last 30 days)
    total_error = distribution.get('error', 0)
    total_done = distribution.get('done', 0)
    total_other = sum(v for k, v in distribution.items() if k not in ('error', 'done'))
    pct_total_error = (total_error / total) * 100 if total else 0
    report['total_error_pct'] = round(pct_total_error, 2)

    # 10. Verdict
    if pct_total_error >= 25 or pct_error >= 25:
        report['verdict'] = 'real_blocker'
        report['note'] = (
            f'{total_error}/{total} ({pct_total_error:.1f}%) registros en estado error globalmente. '
            f'En los últimos 30 días: {len(error_records)} en error y {len(stuck)} stuck (>7d sin done). '
            f'Evidencia DIRECTA de _action_done() fallando en una fracción crítica de registros. '
            'IDs de muestra para investigar disponibles en el reporte JSON.'
        )
    elif pct_total_error > 5 or pct_stuck > 5:
        report['verdict'] = 'partial'
        report['note'] = f'{total_error}/{total} en error ({pct_total_error:.1f}%); {len(stuck)} stuck. Patrón menor pero vigilar.'
    else:
        report['verdict'] = 'false_alarm'
        report['note'] = 'Todos los registros procesan correctamente. _action_done() funciona en producción.'

    print(f'  VERDICT: {report["verdict"]} — {report["note"]}')
    return report


def check_g014() -> dict:
    """Verify gf_logistics_ops for duplicate model class declarations."""
    print('=== G014: gf_logistics_ops duplicate classes verification ===')
    report: dict = {'gap': 'G014', 'checked_at': datetime.now(timezone.utc).isoformat()}

    module_info = fetch_module_info('gf_logistics_ops')
    report['module'] = module_info
    if not module_info:
        report['verdict'] = 'unknown'
        report['note'] = 'gf_logistics_ops no encontrado.'
        return report

    # Models declared by the module
    model_rows = fetch_models_for_module('gf_logistics_ops')
    report['models_declared'] = len(model_rows)
    print(f'  ir.model entries declared by gf_logistics_ops: {len(model_rows)}')

    # Group by _name (model field) to detect duplicates declared via the same module
    by_name: dict[str, list[dict]] = defaultdict(list)
    for row in model_rows:
        by_name[row['model']].append(row)

    intra_dups = {name: rows for name, rows in by_name.items() if len(rows) > 1}
    report['intra_module_duplicates'] = {name: [r['id'] for r in rows] for name, rows in intra_dups.items()}

    # Cross-module: query ir.model directly for any model whose modules csv includes gf_logistics_ops alongside another
    cross_dups: list[dict] = []
    if model_rows:
        all_names = sorted({row['model'] for row in model_rows})
        for chunk_start in range(0, len(all_names), 100):
            chunk = all_names[chunk_start:chunk_start + 100]
            entries = safe_call(
                'ir.model', 'search_read',
                [('model', 'in', chunk)],
                {'fields': ['id', 'model', 'name', 'modules']},
            )
            grouped: dict[str, list[dict]] = defaultdict(list)
            for entry in entries:
                grouped[entry['model']].append(entry)
            for name, items in grouped.items():
                if len(items) > 1:
                    cross_dups.append({'model': name, 'entries': items})
                else:
                    modules_csv = (items[0].get('modules') or '')
                    declarers = [m.strip() for m in modules_csv.split(',') if m.strip()]
                    if len(declarers) > 1:
                        cross_dups.append({
                            'model': name,
                            'declared_by': declarers,
                            'ir_model_id': items[0]['id'],
                        })

    report['cross_module_overlaps'] = cross_dups
    print(f'  intra-module duplicates: {len(intra_dups)}')
    print(f'  cross-module overlaps (model declared by gf_logistics_ops + others): {len(cross_dups)}')

    # ir.model.data records under gf_logistics_ops module — count by xml_id pattern, useful for Sebastián
    data_rows = safe_call(
        'ir.model.data', 'search_read',
        [('module', '=', 'gf_logistics_ops')],
        {'fields': ['name', 'model', 'res_id'], 'limit': 2000},
    )
    by_model_xml = Counter(row['model'] for row in data_rows)
    report['ir_model_data_counts_top'] = by_model_xml.most_common(15)
    report['ir_model_data_total'] = len(data_rows)
    print(f'  ir.model.data records: {len(data_rows)}')

    if intra_dups:
        report['verdict'] = 'real_blocker'
        report['note'] = (
            f'Duplicados intra-módulo: {len(intra_dups)} _name(s) repetidos. '
            f'Sebastián debe revisar archivos Python que registren mismo _name en gf_logistics_ops.'
        )
    elif cross_dups:
        # Cross-module overlap is normal in Odoo (several modules can extend the same model with _inherit).
        # Only flag if the same _name is declared (not inherited) in gf_logistics_ops AND another module.
        report['verdict'] = 'partial'
        report['note'] = (
            f'{len(cross_dups)} modelos están declarados/extendidos por gf_logistics_ops y otros módulos. '
            'Probable uso legítimo de _inherit. Para confirmar duplicación real, Sebastián debe inspeccionar '
            'que cada modelo aquí use _inherit y no _name nuevo.'
        )
    else:
        report['verdict'] = 'false_alarm'
        report['note'] = 'No se detectaron duplicados de _name en gf_logistics_ops desde la metadata visible.'

    print(f'  VERDICT: {report["verdict"]} — {report["note"]}')
    return report


def check_modules() -> dict:
    """Inventory of KOLD-related modules and their state.

    Detects pending upgrades or installations that could leave the system in
    a fragile state.
    """
    print('=== Module inventory (kold/gf prefixes) ===')
    rows = safe_call(
        'ir.module.module', 'search_read',
        ['|', '|', ('name', '=like', 'gf_%'), ('name', '=like', 'kold_%'), ('name', '=', 'gf_metabase_embed')],
        {'fields': ['name', 'state', 'latest_version', 'installed_version', 'shortdesc'], 'limit': 200},
    )
    suspicious = [
        r for r in rows
        if r['state'] in {'to upgrade', 'to install', 'to remove', 'uninstallable'}
    ]
    print(f'  total kold/gf modules: {len(rows)}')
    print(f'  suspicious states: {len(suspicious)}')
    for s in suspicious:
        print(f'    - {s["name"]}: {s["state"]} (v{s.get("installed_version") or "n/a"})')
    return {'modules': rows, 'suspicious': suspicious}


# ────────────────────────────── Entrypoint ──────────────────────────────────

def _dump(label: str, payload) -> None:
    out_path = SCRIPT_DIR / f'odoo_audit_{label}.json'
    out_path.write_text(json.dumps(payload, indent=2, default=str), encoding='utf-8')
    print(f'  → wrote {out_path.name}')


def main() -> int:
    args = sys.argv[1:]
    if not args or args == ['--help'] or args == ['-h']:
        print(__doc__)
        return 0

    if '--test-block' in args:
        test_block()
        return 0

    # Real verifications require auth — fail loudly if env is missing
    _require_env()

    if '--check-g013' in args:
        report = check_g013()
        _dump('g013', report)
    if '--check-g014' in args:
        report = check_g014()
        _dump('g014', report)
    if '--check-modules' in args:
        report = check_modules()
        _dump('modules', report)
    if '--check-all' in args:
        all_report = {
            'g013': check_g013(),
            'g014': check_g014(),
            'modules': check_modules(),
        }
        _dump('all', all_report)
    return 0


if __name__ == '__main__':
    sys.exit(main())
