import { BUDGET_THRESHOLD, estimateMonthly, MONTHLY_LIMIT, type BudgetPart } from './budget';
import type { Catalog, Properties, Property } from './catalog';

// The document `EVENTS.md` (spec 0015 R6, plan §4): Russian text around the catalog's names.
// Numbers are formatted by hand, not by `Intl`, so the output does not depend on Node's ICU data:
// `events-doc.test.ts` compares it byte for byte.

/** Rounds to at most `fractionDigits`, groups thousands with a space, a decimal comma. */
function formatNumber(value: number, fractionDigits = 3): string {
  const [whole = '0', fraction] = String(Number(value.toFixed(fractionDigits))).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return fraction ? `${grouped},${fraction}` : grouped;
}

/** Text on one line, for a heading or a table cell. */
function oneLine(text: string): string {
  return text.replace(/\r\n?|\n/g, ' ');
}

/** Text safe inside a table cell. */
function cell(text: string): string {
  return oneLine(text).replaceAll('|', '\\|');
}

function table(header: readonly string[], rows: readonly (readonly string[])[]): string {
  return [header, header.map(() => '---'), ...rows]
    .map((row) => `| ${row.join(' | ')} |`)
    .join('\n');
}

function property(name: string, value: Property): string {
  if (value.kind === 'enum') {
    return `\`${name}\`: ${value.values.map((v) => `\`${v}\``).join(', ')}`;
  }
  return `\`${name}\`: ${value.kind}`;
}

function properties(list: Properties | undefined): string {
  const entries = Object.entries(list ?? {});
  return entries.length === 0
    ? '—'
    : cell(entries.map(([name, value]) => property(name, value)).join('<br>'));
}

function budget(catalog: Catalog): string {
  const estimate = estimateMonthly(catalog);
  const row = (label: string, part: BudgetPart, bold = false): string[] => {
    const values = [label, formatNumber(part.perVisit), formatNumber(part.perMonth, 0)];
    return bold ? values.map((value) => `**${value}**`) : values;
  };
  const share = formatNumber((estimate.total.perMonth / MONTHLY_LIMIT) * 100, 1);
  return [
    '## Бюджет',
    `Оценка объёма в месяц при ${formatNumber(catalog.visitsPerMonth)} визитах.`,
    table(
      ['Часть', 'За визит', 'В месяц'],
      [
        row('События каталога', estimate.events),
        row('Клики по элементам (`Element Clicked`)', estimate.clicks),
        row('Наведения на элементы (`Element Hovered`)', estimate.hovers),
        row('Собственные события SDK (просмотры страниц, клики для тепловых карт)', estimate.sdk),
        row('Всего', estimate.total, true),
      ],
    ),
    `Это ${share} % от ${formatNumber(MONTHLY_LIMIT)} событий в месяц бесплатного плана Mixpanel; ` +
      `порог — ${formatNumber(BUDGET_THRESHOLD * 100)} % ` +
      `(${formatNumber(MONTHLY_LIMIT * BUDGET_THRESHOLD)}).`,
  ].join('\n\n');
}

function commonEvents(catalog: Catalog): string {
  return [
    '## Общие события',
    'Клики и наведения на отслеживаемые элементы. Каждая отправка несёт `element` (id элемента), ' +
      'зону своего элемента (`zone`), его тип (`type`) и свойства элемента. Их объём — сумма ' +
      'оценок кликов и наведений элементов из таблиц зон.',
    table(
      ['Событие', 'Описание'],
      Object.entries(catalog.commonEvents).map(([name, event]) => [
        `\`${name}\``,
        cell(event.description),
      ]),
    ),
  ].join('\n\n');
}

function zone(catalog: Catalog, key: string): string {
  const { title, areas, description } = catalog.zones[key]!;
  const events = Object.entries(catalog.events).filter(([, event]) => event.zone === key);
  const elements = Object.entries(catalog.elements).filter(([, element]) => element.zone === key);
  return [
    `## ${oneLine(title)} (\`${key}\`)`,
    description,
    `Области: ${areas.map((area) => `\`${area}\``).join(', ')}.`,
    '### События',
    events.length === 0
      ? 'Нет.'
      : table(
          ['Событие', 'Тип', 'Свойства', 'За визит', 'Описание'],
          events.map(([name, event]) => [
            `\`${name}\``,
            `\`${event.type}\``,
            properties(event.properties),
            formatNumber(event.perVisit),
            cell(event.description),
          ]),
        ),
    '### Элементы',
    elements.length === 0
      ? 'Нет.'
      : table(
          ['Элемент', 'Тип', 'Свойства', 'Кликов за визит', 'Наведений за визит', 'Описание'],
          elements.map(([id, element]) => [
            `\`${id}\``,
            `\`${element.type}\``,
            properties(element.properties),
            formatNumber(element.clicksPerVisit),
            formatNumber(element.hoversPerVisit),
            cell(element.description),
          ]),
        ),
  ].join('\n\n');
}

/** The events document, Markdown, generated from the catalog. */
export function renderEventsDoc(catalog: Catalog): string {
  return `${[
    '# События аналитики',
    '> Файл создан из `catalog.ts` функцией `renderEventsDoc` (`render-events-doc.ts`), руками ' +
      'не правится. После изменения каталога: `npm --prefix web test -- -u`.',
    budget(catalog),
    commonEvents(catalog),
    ...Object.keys(catalog.zones).map((key) => zone(catalog, key)),
  ].join('\n\n')}\n`;
}
