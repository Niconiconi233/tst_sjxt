import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><html><body><div id="host"></div></body></html>', { pretendToBeVisual: true });
for (const k of ['window','document','HTMLElement','Element','Node','DOMParser','getComputedStyle','requestAnimationFrame','cancelAnimationFrame','MutationObserver']) {
  try { Object.defineProperty(globalThis, k, { value: dom.window[k] ?? dom.window, configurable: true, writable: true }); } catch {}
}
try { Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true }); } catch {}
dom.window.HTMLCanvasElement.prototype.getContext = () => null;

const { Univer, UniverInstanceType } = await import('@univerjs/core');
const { UniverDocsPlugin } = await import('@univerjs/docs');

const sparse = {
  id: 'doc_x',
  title: 't',
  body: { dataStream: '标题\r正文一\r正文二\r', textRuns: [{ st: 0, ed: 2, ts: { bl: 1, fs: 22 } }],
    paragraphs: [{ startIndex: 2, paragraphId: 'p0' }, { startIndex: 5, paragraphId: 'p1' }, { startIndex: 9, paragraphId: 'p2' }] },
  documentStyle: { pageSize: { width: 595.3, height: 841.9 }, marginTop: 72, marginBottom: 72, marginLeft: 90, marginRight: 90 },
};

const u = new Univer({ locale: 'zhCN' });
u.registerPlugin(UniverDocsPlugin);
try {
  const unit = u.createUnit(UniverInstanceType.UNIVER_DOC, sparse);
  const snap = unit.getSnapshot();
  console.log('createUnit OK');
  console.log('dataStream =', JSON.stringify(snap.body?.dataStream));
  console.log('textRuns =', JSON.stringify(snap.body?.textRuns));
  console.log('paragraphs =', JSON.stringify(snap.body?.paragraphs));
} catch (e) {
  console.log('createUnit THREW:', e && e.message);
  console.log(e && e.stack && e.stack.split('\n').slice(0,6).join('\n'));
}
