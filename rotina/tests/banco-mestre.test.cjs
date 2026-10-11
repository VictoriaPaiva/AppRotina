/* eslint-disable @typescript-eslint/no-require-imports -- Arquivo CommonJS do runner nativo do Node. */
/* Testes locais de domínio: sem navegador, backend ou novas dependências. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
function load(file) {
  const exports = {};
  const source = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 } }).outputText;
  new Function('exports', source)(exports);
  return exports;
}
const editor = load('lib/banco-mestre/editor.ts');
const mocks = load('lib/banco-mestre/mock-data.ts');
const view = load('lib/banco-mestre/presentation.ts');
const stamp = '2026-10-11T18:00:00Z';
const bundle = id => ({ activity: mocks.mockActivities.find(item => item.id === id), goals: mocks.mockGoals.filter(item => item.activityId === id), rules: mocks.mockRecurrenceRules.filter(item => item.activityId === id), windows: mocks.mockTimeWindows.filter(item => item.activityId === id) });
const build = (draft, original) => editor.buildBundle(draft, mocks.mockAreas, original?.id || 'new', stamp, original);
const draft = () => ({ ...editor.createDraft(), name: 'Item teste', areaId: 'casa' });

test('todos os mocks e relações sobrevivem a criação/edição sem perda', () => {
  for (const activity of mocks.mockActivities) {
    const initial = bundle(activity.id);
    const result = build(editor.createDraft(initial), activity);
    assert(result.ok, JSON.stringify(result));
    assert.deepEqual(result.bundle, { ...initial, activity: { ...activity, updatedAt: stamp } });
    const created = build(editor.createDraft(initial));
    assert(created.ok);
    assert.equal(created.bundle.activity.status, 'active');
  }
});
test('oito cenários aprovados têm configurações e relações coerentes', () => {
  assert.equal(bundle('aniversario-mae').rules[0].interval, 12);
  assert.equal(bundle('cabelo').rules[0].interval, 3);
  assert.equal(bundle('dentista').activity.config.travel.outboundMinutes, 30);
  assert.equal(bundle('dentista').activity.config.preparationMinutes, 30);
  assert.deepEqual(bundle('trabalho').activity.config.schedules.map(row => row.weekdays.length), [2, 3]);
  assert.deepEqual(bundle('academia').activity.duration, { mode: 'minimumIdeal', minMinutes: 30, idealMinutes: 60 });
  assert.equal(bundle('academia').rules.length, 0);
  assert.equal(bundle('academia').windows[0].startTime, '14:30');
  assert.equal(bundle('faxina').goals[0].minimumTarget, 1);
  assert.deepEqual(bundle('faxina').windows[0].weekdays, ['saturday']);
  assert.equal(bundle('agua').goals[0].unit, 'garrafas');
  assert.equal(bundle('escovar').goals[0].idealTarget, 3);
  assert.equal(bundle('escovar').rules.length, 0);
});
test('horas/minutos e tempos opcionais convertem e validam limites', () => {
  const base = { ...draft(), durationMode: 'fixed', hours: '1', minutes: '30' };
  assert.equal(build(base).bundle.activity.duration.minutes, 90);
  for (const patch of [{ hours: '-1' }, { hours: '1.5' }, { minutes: '60' }, { minutes: '-1' }, { hours: '0', minutes: '0' }, { hours: 'Infinity' }, { minutes: '' }]) assert(!build({ ...base, ...patch }).ok);
  assert(!build({ ...base, durationMode: 'minimumIdeal', minimumHours: '1', minimum: '0', idealHours: '0', ideal: '59' }).ok);
  assert(!build({ ...base, durationMode: 'range' }).ok);
  const r = build({ ...draft(), preparationMinutes: '30', outboundMinutes: '30', returnHours: '1', returnMinutes: '0' });
  assert(r.ok); assert.equal(r.bundle.activity.config.preparationMinutes, 30); assert.equal(r.bundle.activity.config.travel.returnMinutes, 60);
  assert(!build({ ...draft(), outboundMinutes: '60' }).ok);
  assert(!('travel' in build(draft()).bundle.activity.config));
});
test('datas reais e intervalos de compromisso/grupos fixos são obrigatórios', () => {
  const commitment = { ...draft(), type: 'commitment', date: '2026-10-18', startTime: '16:00', endTime: '17:00' };
  assert(build(commitment).ok);
  for (const patch of [{ date: '' }, { date: '2026-02-30' }, { endTime: '16:00' }, { endTime: '15:00' }, { startTime: '25:00' }]) assert(!build({ ...commitment, ...patch }).ok);
  assert(!build({ ...draft(), type: 'fixedActivity' }).ok);
  assert(!build({ ...draft(), type: 'fixedActivity', schedules: [{ id: 's', weekdays: [], startTime: '06:00', endTime: '15:00' }] }).ok);
  assert(!build({ ...draft(), type: 'reminder', referenceDate: '2026-02-30' }).ok);
});
test('metas de tempo usam horas/minutos; contagem e quantidade são distintas', () => {
  const base = { ...draft(), type: 'checklistGoal' };
  assert(!build(base).ok);
  const goal = { id: 'g', enabled: true, metric: 'duration', unit: 'minute', minimumHours: '1', minimum: '30', idealHours: '2', ideal: '0', period: 'week', startsOn: '2026-10-11', endsOn: '' };
  const r = build({ ...base, goals: [goal] }); assert(r.ok); assert.equal(r.bundle.goals[0].minimumTarget, 90); assert.equal(r.bundle.goals[0].idealTarget, 120);
  assert(!build({ ...base, goals: [{ ...goal, idealHours: '1', ideal: '0' }] }).ok);
  assert(!build({ ...base, goals: [{ ...goal, metric: 'count', minimum: '1.5', ideal: '' }] }).ok);
  assert(!build({ ...base, goals: [{ ...goal, metric: 'quantity', minimum: '8', ideal: '10', unit: '' }] }).ok);
});
test('repetição anual/última realização e preferências mantêm semântica', () => {
  const d = editor.createDraft(bundle('aniversario-mae')); assert.equal(d.rules[0].kind, 'annual');
  assert.equal(view.formatRecurrence(build(d).bundle.rules[0]), 'Anual');
  assert(!build({ ...d, rules: [{ ...d.rules[0], anchorDate: '2026-02-30' }] }).ok);
  const hair = editor.createDraft(bundle('cabelo')); hair.rules[0].kind = 'completion';
  assert(!('anchorDate' in build(hair).bundle.rules[0]));
  const academy = editor.createDraft(bundle('academia'));
  assert(!build({ ...academy, windows: [{ ...academy.windows[0], effect: 'forbidden' }] }).ok);
  assert(!build({ ...academy, windows: [{ ...academy.windows[0], endTime: '14:00' }] }).ok);
});
test('troca de tipo preserva dados comuns e limpa relações/configuração específica', () => {
  const initial = bundle('academia'), d = editor.createDraft(initial);
  assert(editor.hasSpecificData(d));
  const changed = editor.changeItemType(d, 'fixedActivity');
  assert.equal(changed.name, d.name); assert.equal(changed.durationMode, d.durationMode); assert.equal(changed.goals.length, 0); assert.equal(changed.windows.length, 0);
  changed.schedules = [{ id: 'g', weekdays: ['monday'], startTime: '09:00', endTime: '10:00' }];
  const r = build(changed, initial.activity); assert(r.ok); assert.equal(r.bundle.activity.id, initial.activity.id); assert.equal(r.bundle.activity.createdAt, initial.activity.createdAt);
  assert.deepEqual(initial, bundle('academia')); assert(!('trackingMode' in r.bundle.activity));
  assert(!build({ ...d, type: 'fixedActivity' }, initial.activity).ok);
});
test('estado local substitui relações atomicamente; filtros combinam tipo/busca', () => {
  const state = { activities: mocks.mockActivities, goals: mocks.mockGoals, rules: mocks.mockRecurrenceRules, windows: mocks.mockTimeWindows };
  const initial = bundle('academia'), d = editor.changeItemType(editor.createDraft(initial), 'fixedActivity');
  d.schedules = [{ id: 's', weekdays: ['monday'], startTime: '09:00', endTime: '10:00' }];
  const result = build(d, initial.activity), next = editor.saveBundle(state, result.bundle);
  assert.equal(next.activities.length, state.activities.length); assert(!next.goals.some(g => g.activityId === 'academia')); assert(!next.windows.some(w => w.activityId === 'academia')); assert(state.goals.some(g => g.activityId === 'academia'));
  assert.equal(view.filterActivities(next.activities, { search: 'ACADEMIA', areaId: 'all', type: 'fixedActivity', importance: 'all', status: 'all' }).length, 1);
  const inactive = editor.createDraft(initial); inactive.status = 'inactive'; assert.equal(build(inactive, initial.activity).bundle.activity.status, 'inactive');
});
