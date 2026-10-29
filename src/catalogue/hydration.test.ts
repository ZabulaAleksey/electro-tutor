import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import Catalogue from './Catalogue';

it('server-rendered catalogue exposes real links but gates controls until hydration', () => {
  const html = renderToStaticMarkup(createElement(Catalogue, { language: 'ru', showFilters: true }));
  const controls = [...html.matchAll(/<(button|input)\b[^>]*>/g)].map(match => match[0]);
  expect(controls.length).toBeGreaterThan(10);
  for (const control of controls) expect(control).toContain('disabled=""');
  expect(html).toContain('href="/ru/interactive/beam/"');
  expect(html).toContain('Показать ещё');
});
