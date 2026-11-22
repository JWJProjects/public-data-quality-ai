"""Optional: run with Python Playwright and an installed Chromium; npm test needs neither."""
import json
import os
import threading
from contextlib import contextmanager
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "assets"
ARGS = ["--disable-dev-shm-usage", "--disable-breakpad", "--no-sandbox"]

class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass

@contextmanager
def local_server():
    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(Handler, directory=ROOT))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield "http://127.0.0.1:" + str(server.server_address[1])
    finally:
        server.shutdown()
        server.server_close()

def counts(page):
    return [int(v) for v in page.locator(".metric strong").all_inner_texts()]

def click(page, action):
    page.locator('[data-action="' + action + '"]').click()

def tab(page, key):
    page.locator('[data-tab="' + key + '"]').click()

def fetch_download(page, action):
    with page.expect_download() as event:
        click(page, action)
    return event.value, Path(event.value.path()).read_text(encoding="utf-8-sig")

def shot(page, name):
    page.evaluate("document.fonts.ready")
    page.mouse.move(0,0)
    page.locator(":focus").evaluate_all("(nodes)=>nodes.forEach(e=>e.blur())")
    page.screenshot(path=OUT / name, type="jpeg", quality=92, animations="disabled")

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    with local_server() as url, sync_playwright() as pw:
        executable = os.environ.get("CHROMIUM_PATH", "/usr/bin/chromium")
        b = pw.chromium.launch(executable_path=executable, args=ARGS)
        page = b.new_page(viewport={"width":1440,"height":1040},accept_downloads=True)
        errors = []
        requests = []
        page.on("pageerror", lambda err: errors.append(str(err)))
        page.on("request", lambda req: requests.append(req.url))
        page.goto(url)
        expect(page.locator("h1")).to_have_text("資料品管總覽")
        assert counts(page) == [18,12,2,4]
        assert page.locator('tbody tr').count() == 18
        shot(page, "01-overview.jpg")
        tab(page, "mapping")
        expect(page.locator('select[data-map="id"]')).to_have_value("巡檢單號")
        page.locator("#mapping-source").select_option("1")
        expect(page.locator('select[data-map="id"]')).to_have_value("案件編號")
        shot(page, "02-mapping.jpg")
        tab(page, "review")
        assert page.locator(".review-card").count() == 6
        shot(page, "03-review.jpg")
        page.locator('[data-action^="toggle-review"]').first.click()
        expect(page.get_by_text("已覆核放行", exact=True)).to_have_count(1)
        tab(page, "report")
        shot(page, "04-export.jpg")
        qa, qa_text = fetch_download(page, "qa-export")
        obj = json.loads(qa_text)
        assert qa.suggested_filename == "qa-evidence.json"
        assert obj == {"schema":"portfolio.qa-evidence.v1","profile":"policy","synthetic":True,
                       "result":{"totalRows":18,"passedRows":13,"reviewRows":1,"rejectedRows":4}}
        if os.environ.get("WRITE_EVIDENCE_FIXTURE")=="1":
            (ROOT/"examples"/"qa-evidence.json").write_text(qa_text, encoding="utf-8")
        _, csv = fetch_download(page, "csv")
        assert csv.count("\n") == 14 and '"source_row"' in csv
        _, norm = fetch_download(page, "json")
        assert len(json.loads(norm)) == 13
        _, internal = fetch_download(page, "internal-report")
        report = json.loads(internal)
        assert len(report["reviewHistory"]) == 1 and len(report["records"]) == 18
        assert "F-26005" not in internal and "NT$" not in internal
        page.locator('[data-profile="services"]').click()
        tab(page, "overview")
        assert counts(page)==[18,12,2,4]
        page.locator('[data-profile="facilities"]').click()
        page.locator('#upload').set_input_files(ROOT/"examples"/"facilities-legacy.csv")
        expect(page.locator("h1")).to_have_text("欄位與規則")
        expect(page.locator('select[data-map="id"]')).to_have_value("")
        page.locator('select[data-map="id"]').select_option("巡檢郵件編號")
        page.locator('#upload').set_input_files(ROOT/"examples"/"facilities-append.json")
        expect(page.locator('#mapping-source')).to_have_value("1")
        tab(page,"overview")
        assert counts(page)==[6,3,1,2], counts(page)
        shot(page,"06-integrated.jpg")
        assert page.locator('tbody tr').filter(has_text="X-26002").count()==2
        tab(page,"review")
        expect(page.get_by_text("案件編號: 案件編號重複，保留第一筆待查",exact=True)).to_have_count(1)
        tab(page,"report")
        expect(page.locator('[data-action="qa-export"]')).to_be_disabled()
        _, exported = fetch_download(page, "json")
        assert [(r["id"],r["source_order"],r["source_row"]) for r in json.loads(exported)] == [
            ("X-26001",1,1),("X-26002",1,2),("X-26005",2,3)]
        page.locator("#upload").set_input_files({"name":"bad.csv","mimeType":"text/csv","buffer":b"x,y\n1"})
        expect(page.get_by_role("alert")).to_contain_text("欄數")
        tab(page,"overview")
        assert counts(page)==[6,3,1,2]
        mobile = b.new_page(viewport={"width":390,"height":844},is_mobile=True,has_touch=True)
        mobile.on("pageerror",lambda err: errors.append(str(err)))
        mobile.goto(url)
        expect(mobile.locator("h1")).to_have_text("資料品管總覽")
        assert mobile.evaluate("document.documentElement.scrollWidth === window.innerWidth")
        shot(mobile,"05-mobile.jpg")
        assert not errors,errors
        assert all(u.startswith(url) for u in requests), requests
        b.close()
        print("Browser QA passed: both presets, two-format append and manual mapping, malformed import, traceable CSV/JSON, approval audit, safe QA interchange, mobile layout, and six Chromium captures")
if __name__ == "__main__":
    main()
