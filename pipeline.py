# POS Analysis Pipeline v3.2
# GitHub: yukitanego/pos-dashboard
# Usage: exec(urllib.request.urlopen(URL).read().decode('utf-8'))
import pandas as pd, json, re

# ============ auto_config: CSV自動判別 ============
def auto_config(df):
    def _f(kws, need=[], excl=[]):
        for c in df.columns:
            s = str(c)
            if any(k in s for k in kws) and all(n in s for n in need) and not any(e in s for e in excl): return c
        return None
    cm = {
        'date': _f(['日付','販売日','売上日','取引日','date','ymd']),
        'product': _f(['商品名','品名'], excl=['CD','コード']),
        'sales': _f(['税抜金額','税抜売上'], excl=['前期','期間比']) or _f(['金額','amount'], excl=['前期','期間比','税込']),
        'prev_sales': _f(['金額'], need=['前期'], excl=['期間比']),
        'qty': _f(['数量','qty'], excl=['前期','期間比']),
        'prev_qty': _f(['数量'], need=['前期'], excl=['期間比']),
        'category': _f(['カテゴリー','カテゴリ'], excl=['CD','サブ']),
        'subcategory': _f(['サブカテゴリ'], excl=['CD']),
        'jan': _f(['JAN','ＪＡＮ','バーコード','EAN']),
    }
    cat_col = cm.get('category')
    cats = df[cat_col].value_counts().index.tolist() if cat_col and cat_col in df.columns else []
    ca = cats[0] if len(cats) >= 1 else '全商品'
    cb = cats[1] if len(cats) >= 2 else ''
    ca_f = {'col': cat_col, 'values': [ca]} if cat_col and ca != '全商品' else None
    cb_f = {'col': cat_col, 'values': [cb]} if cat_col and cb else None
    ar = {}
    seg = _f(['セグメント'], excl=['CD','サブ'])
    subseg = _f(['サブセグメント'], excl=['CD'])
    subcat = cm.get('subcategory')
    if seg: ar['cat_a_axis1'] = {'title': 'セグメント別', 'col': seg}
    if subseg: ar['cat_a_axis2'] = {'title': 'サブセグメント別', 'col': subseg}
    elif subcat: ar['cat_a_axis2'] = {'title': 'サブカテゴリ別', 'col': subcat}
    if cb:
        if seg: ar['cat_b_axis1'] = {'title': 'セグメント別', 'col': seg}
        if subseg: ar['cat_b_axis2'] = {'title': 'サブセグメント別', 'col': subseg}
        elif subcat: ar['cat_b_axis2'] = {'title': 'サブカテゴリ別', 'col': subcat}
    return {'col_map': cm, 'cat_a': ca, 'cat_b': cb, 'cat_a_filter': ca_f, 'cat_b_filter': cb_f, 'axis_rules': ar}

# ============ auto_master_config: マスタ自動判別 ============
def auto_master_config(path):
    import openpyxl
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb.active; hr = 1; jan_col = None; tags = {}
    for i, row in enumerate(ws.iter_rows(min_row=1, max_row=50, values_only=True), 1):
        vals = {j: str(v) for j, v in enumerate(row[:15]) if v is not None}
        for j, v in vals.items():
            if 'JAN' in v.upper() or 'ＪＡＮ' in v:
                hr = i; jan_col = v
                for jj, vv in vals.items():
                    if ('ｻﾌﾞｶﾃｺﾞﾘ' in vv or 'サブカテゴリ' in vv) and 'ｾｸﾞ' not in vv: tags['_M_subcat'] = vv
                    if ('ｾｸﾞﾒﾝﾄ' in vv or 'セグメント' in vv) and 'ｻﾌﾞ' not in vv and 'サブ' not in vv: tags['_M_segment'] = vv
                    if 'ｻﾌﾞｾｸﾞﾒﾝﾄ' in vv or 'サブセグメント' in vv: tags['_M_subseg'] = vv
                break
        if jan_col: break
    wb.close()
    return {'header_row': hr, 'jan_col': jan_col, 'tag_cols': tags}

# ============ validate_config: 設定検証 ============
def validate_config(df, config):
    cm = config['col_map']; errs = []
    for k in ['date','product','sales','qty']:
        if not cm.get(k) or cm[k] not in df.columns: errs.append(f'必須カラム {k}={cm.get(k)} が見つかりません')
    for k in ['prev_sales','prev_qty','category','subcategory','jan']:
        v = cm.get(k)
        if v and v not in df.columns: errs.append(f'カラム {k}={v} が見つかりません')
    for fk in ['cat_a_filter','cat_b_filter']:
        f = config.get(fk)
        if f:
            if f['col'] not in df.columns: errs.append(f'{fk}: カラム {f["col"]} が見つかりません')
            elif df[f['col']].isin(f['values']).sum() == 0: errs.append(f'{fk}: 値 {f["values"]} に一致する行がありません')
    for ak, rule in config.get('axis_rules', {}).items():
        if 'col' in rule and rule['col'] not in df.columns and not rule['col'].startswith('_M_'):
            errs.append(f'{ak}: カラム {rule["col"]} が見つかりません')
    if errs:
        for e in errs: print(f'WARNING: {e}')
    else: print('config検証OK')
    return errs

# ============ load_master: マスタ読み込み ============
def load_master(path, config):
    mc = config.get('master', {}); hr = mc.get('header_row', 1) - 1
    jan = mc.get('jan_col', 'ＪＡＮｺｰﾄﾞ'); tags = mc.get('tag_cols', {})
    m = pd.read_excel(path, header=hr)
    m[jan] = m[jan].astype(str).str.strip().str.replace(r'\.0$', '', regex=True)
    rename = {jan: '_M_JAN'}
    for k, v in tags.items():
        if v in m.columns: rename[v] = k
    m = m[list(rename.keys())].rename(columns=rename).drop_duplicates(subset='_M_JAN')
    return m

# ============ 集計関数 ============
def _classify(name, rule):
    if 'col' in rule: return None
    kws = rule.get('keywords', {}); default = kws.get('_default', 'その他'); name_s = str(name)
    for label, words in kws.items():
        if label == '_default': continue
        if any(w in name_s for w in words): return label
    return default
def _aggregate_products(df, product_col, sales_col, prev_sales_col, qty_col, prev_qty_col):
    agg_dict = {sales_col: 'sum', qty_col: 'sum'}
    if prev_sales_col: agg_dict[prev_sales_col] = 'sum'
    if prev_qty_col: agg_dict[prev_qty_col] = 'sum'
    prod = df.groupby(product_col, sort=False).agg(agg_dict).reset_index()
    prod = prod.sort_values(sales_col, ascending=False).reset_index(drop=True)
    total_s = prod[sales_col].sum()
    prod['_cp'] = (prod[sales_col].cumsum() / total_s * 100) if total_s > 0 else 0
    prod['_rank'] = prod['_cp'].apply(lambda x: 'A' if x <= 80 else ('B' if x <= 95 else 'C'))
    results = []
    for _, r in prod.iterrows():
        s = int(r[sales_col]); ps = int(r[prev_sales_col]) if prev_sales_col and pd.notna(r.get(prev_sales_col)) else 0
        q = int(r[qty_col]); pq = int(r[prev_qty_col]) if prev_qty_col and pd.notna(r.get(prev_qty_col)) else 0
        sy = round(s / ps * 100, 1) if ps > 0 else 0; qy = round(q / pq * 100, 1) if pq > 0 else 0
        results.append({'n': str(r[product_col]), 's': s, 'ps': ps, 'sy': sy, 'sd': s - ps, 'q': q, 'pq': pq, 'qy': qy, 'qd': q - pq, 'r': r['_rank'], 'cp': round(r['_cp'], 1)})
    return results
def _aggregate_axis(df, product_col, sales_col, prev_sales_col, rule):
    if 'col' in rule:
        col = rule['col']
        if col not in df.columns: return []
        agg_dict = {sales_col: 'sum'}
        if prev_sales_col and prev_sales_col in df.columns: agg_dict[prev_sales_col] = 'sum'
        grp = df.groupby(col, sort=False).agg(agg_dict).reset_index().sort_values(sales_col, ascending=False)
        results = []
        for _, r in grp.iterrows():
            prev = int(r[prev_sales_col]) if prev_sales_col and prev_sales_col in grp.columns else 0
            results.append({'name': str(r[col]), 'sales': int(r[sales_col]), 'prev': prev})
        return results
    elif 'keywords' in rule:
        df = df.copy(); df['_axis_label'] = df[product_col].apply(lambda x: _classify(x, rule))
        agg_dict = {sales_col: 'sum'}
        if prev_sales_col and prev_sales_col in df.columns: agg_dict[prev_sales_col] = 'sum'
        grp = df.groupby('_axis_label', sort=False).agg(agg_dict).reset_index().sort_values(sales_col, ascending=False)
        results = []
        for _, r in grp.iterrows():
            prev = int(r[prev_sales_col]) if prev_sales_col and prev_sales_col in grp.columns else 0
            results.append({'name': str(r['_axis_label']), 'sales': int(r[sales_col]), 'prev': prev})
        return results
    return []
def build_data(df, config, master_df=None):
    cm = config['col_map']; date_col = cm['date']; product_col = cm['product']
    sales_col = cm['sales']; prev_sales_col = cm.get('prev_sales'); qty_col = cm['qty']; prev_qty_col = cm.get('prev_qty')
    for c in [sales_col, qty_col]: df[c] = pd.to_numeric(df[c], errors='coerce').fillna(0).astype(int)
    jan_col = cm.get('jan')
    if master_df is not None and jan_col and jan_col in df.columns:
        df[jan_col] = df[jan_col].astype(str).str.strip().str.replace(r'\.0$', '', regex=True)
        n_before = len(df)
        df = df.merge(master_df, left_on=jan_col, right_on='_M_JAN', how='left')
        matched = df['_M_JAN'].notna().sum()
        print(f'マスタ照合: {matched}/{n_before}行マッチ ({matched/n_before*100:.0f}%)')
        for c in master_df.columns:
            if c != '_M_JAN' and c in df.columns: df[c] = df[c].fillna('不明')
    if prev_sales_col and prev_sales_col in df.columns: df[prev_sales_col] = pd.to_numeric(df[prev_sales_col], errors='coerce').fillna(0).astype(int)
    else: prev_sales_col = None
    if prev_qty_col and prev_qty_col in df.columns: df[prev_qty_col] = pd.to_numeric(df[prev_qty_col], errors='coerce').fillna(0).astype(int)
    else: prev_qty_col = None
    if not prev_sales_col: df['_ps'] = 0; prev_sales_col = '_ps'
    if not prev_qty_col: df['_pq'] = 0; prev_qty_col = '_pq'
    if config.get('pivot_date_cols'):
        id_cols = [c for c in df.columns if c not in config['pivot_date_cols']]
        df = df.melt(id_vars=id_cols, value_vars=config['pivot_date_cols'], var_name=date_col, value_name=sales_col)
    df[date_col] = df[date_col].astype(str).str.replace(r'[/\-年月日]', '', regex=True).str[:8]
    ca = config['cat_a']; cb = config.get('cat_b', '')
    ca_filter = config.get('cat_a_filter'); cb_filter = config.get('cat_b_filter')
    if ca_filter: df_a = df[df[ca_filter['col']].isin(ca_filter['values'])].copy()
    else: df_a = df.copy()
    if cb_filter: df_b = df[df[cb_filter['col']].isin(cb_filter['values'])].copy()
    else: df_b = pd.DataFrame()
    cat_a_products = _aggregate_products(df_a, product_col, sales_col, prev_sales_col, qty_col, prev_qty_col)
    cat_b_products = _aggregate_products(df_b, product_col, sales_col, prev_sales_col, qty_col, prev_qty_col) if len(df_b) > 0 else []
    daily = {}
    for cat_name, cat_df in [(ca, df_a), (cb, df_b)]:
        if len(cat_df) == 0: continue
        day_agg = cat_df.groupby(date_col).agg({sales_col: 'sum', prev_sales_col: 'sum'}).reset_index()
        for _, r in day_agg.iterrows():
            d = str(r[date_col])
            if d not in daily: daily[d] = {}
            daily[d][cat_name] = {'s': int(r[sales_col]), 'ps': int(r[prev_sales_col])}
    axis_rules = config.get('axis_rules', {})
    cat_a_axis1 = _aggregate_axis(df_a, product_col, sales_col, prev_sales_col, axis_rules.get('cat_a_axis1', {})) if 'cat_a_axis1' in axis_rules else []
    cat_a_axis2 = _aggregate_axis(df_a, product_col, sales_col, prev_sales_col, axis_rules.get('cat_a_axis2', {})) if 'cat_a_axis2' in axis_rules else []
    cat_b_axis1 = _aggregate_axis(df_b, product_col, sales_col, prev_sales_col, axis_rules.get('cat_b_axis1', {})) if 'cat_b_axis1' in axis_rules and len(df_b) > 0 else []
    cat_b_axis2 = _aggregate_axis(df_b, product_col, sales_col, prev_sales_col, axis_rules.get('cat_b_axis2', {})) if 'cat_b_axis2' in axis_rules and len(df_b) > 0 else []
    dates = sorted(daily.keys())
    if dates:
        d0, d1 = dates[0], dates[-1]
        period = f'{d0[:4]}/{d0[4:6]}/{d0[6:]}〜{d1[:4]}/{d1[4:6]}/{d1[6:]}（{len(dates)}日間）'
    else: period = '—'
    n_prod = len(cat_a_products) + len(cat_b_products)
    return {
        'cat_a': ca, 'cat_b': cb if cb else ca,
        'hdr_cat': f'{ca}・{cb}' if cb else ca, 'hdr_period': period,
        'hdr_prod': f'{n_prod}品', 'hdr_rows': f'{len(df):,}行',
        'cat_a_products': cat_a_products, 'cat_b_products': cat_b_products, 'daily': daily,
        'cat_a_axis1': cat_a_axis1, 'cat_a_axis2': cat_a_axis2, 'cat_b_axis1': cat_b_axis1, 'cat_b_axis2': cat_b_axis2,
        'cat_a_axis1_title': axis_rules.get('cat_a_axis1', {}).get('title', '軸1'), 'cat_a_axis2_title': axis_rules.get('cat_a_axis2', {}).get('title', '軸2'),
        'cat_b_axis1_title': axis_rules.get('cat_b_axis1', {}).get('title', '軸1'), 'cat_b_axis2_title': axis_rules.get('cat_b_axis2', {}).get('title', '軸2'),
    }

# ============ HTML出力 ============
_CDN_URL = 'https://cdn.jsdelivr.net/gh/yukitanego/pos-dashboard@v1.1/pos-dashboard.min.js'
_HTML_TPL = ('<!DOCTYPE html>\n'
'<html lang="ja"><head>\n'
'<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">\n'
'<title>POS分析ダッシュボード</title>\n'
'<script src="https://cdn.tailwindcss.com"></script>\n'
'<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>\n'
'<script src="https://cdn.jsdelivr.net/npm/chartjs-plugin-annotation"></script>\n'
'<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&display=swap" rel="stylesheet">\n'
'<script src="__CDN_URL__"></script>\n'
'</head>\n'
'<body class="bg-gray-50 min-h-screen">\n'
'<div id="app"></div>\n'
'<script>\nPOS.render(\'#app\', __DATA_JSON__);\n</script>\n'
'</body></html>')
def run_pipeline(file_path, config, master_path=None):
    df = None
    for enc in ['utf-8', 'cp932', 'shift_jis']:
        try:
            df = pd.read_csv(file_path, encoding=enc)
            if len(df.columns) > 1: break
        except: pass
    if df is None or len(df.columns) <= 1:
        print('ERROR: CSVを読み込めませんでした'); return ''
    print(f'読み込み完了: {len(df)}行 × {len(df.columns)}列')
    master_df = None
    if master_path:
        if 'master' not in config: config['master'] = auto_master_config(master_path)
        master_df = load_master(master_path, config)
        print(f'マスタ読み込み完了: {len(master_df)}品')
    errs = validate_config(df, config)
    if errs: print('configにエラーがあります。修正してください。'); return ''
    data = build_data(df, config, master_df)
    data_json = json.dumps(data, ensure_ascii=False)
    html = _HTML_TPL.replace('__CDN_URL__', _CDN_URL).replace('__DATA_JSON__', data_json)
    print(html); return html

print('Pipeline v3.2 loaded: auto_config, auto_master_config, validate_config, run_pipeline ready.')
