// Run with Node.js 22.18+ and ImageMagick 7 (librsvg and DejaVu Sans).
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dorimosPracticePrescription, dorimosSamples } from '../src/lib/dorimos-samples.ts';

const destination = new URL('../public/demo/', import.meta.url);
mkdirSync(destination, { recursive: true });

const variants = {
  'box-5mg': { accent: '#176e63', background: '#d8e9e7' },
  'box-10mg': { accent: '#895126', background: '#eaded1' },
  'box-other': { accent: '#594e8b', background: '#e8e3ef' },
  'box-unreadable': { accent: '#176e63', background: '#dee5d8', angle: 11, blur: 27 },
  'box-5mg-angled': { accent: '#176e63', background: '#d8e1e5', angle: -18 },
  'box-5mg-low-light': { accent: '#176e63', background: '#88969c', angle: 5, dark: true },
  'box-2-5mg': { accent: '#34608b', background: '#d9e0ec', angle: 8 },
  'box-20mg': { accent: '#784151', background: '#e9dce3', angle: -11 },
  'box-label-covered': { accent: '#176e63', background: '#dcd9ce', angle: -6, covered: true },
  'box-side-only': { accent: '#176e63', background: '#d3dfe5', angle: 18, side: true },
};

function labelCopy(expectation) {
  const label = expectation.status === 'readable' ? expectation : dorimosPracticePrescription;
  return { name: label.drugName.toUpperCase(), strength: `${label.strength} ${label.unit}` };
}

function packageFace({ name, strength }, { accent, dark, covered }) {
  const ink = dark ? '#101a24' : '#182a33';
  return `
    <path d="M148 144 182 115H687L653 144Z" fill="${dark ? '#9ca8a8' : '#e7eeeb'}"/>
    <path d="m653 144 34-29v219l-34 31Z" fill="${accent}"/>
    <rect x="148" y="144" width="505" height="221" fill="${dark ? '#b4bdba' : '#fcfaf4'}"/>
    <rect x="148" y="334" width="505" height="31" fill="${accent}"/>
    <text x="177" y="355" font-size="12" font-weight="bold" fill="#f9f9f4">SUN’IY DEMO QUTI</text>
    <rect x="557" y="164" width="70" height="27" rx="3" fill="${accent}"/>
    <text x="592" y="183" text-anchor="middle" font-size="15" font-weight="bold" fill="#ffffff">DEMO</text>
    <text x="177" y="242" font-size="49" font-weight="bold" fill="${ink}">${name}</text>
    <text x="177" y="311" font-size="62" font-weight="bold" fill="${ink}">${strength}</text>
    ${covered ? '<rect x="162" y="195" width="478" height="133" rx="3" fill="#d2bc91"/>' : ''}
  `;
}

function packageSide(accent) {
  return `
    <path d="m142 211 41-48h451l-39 48Z" fill="#e2e9e5"/>
    <path d="m595 211 39-48v102l-39 50Z" fill="${accent}"/>
    <rect x="142" y="211" width="453" height="104" fill="#f9f8ef"/>
    <rect x="142" y="299" width="453" height="16" fill="${accent}"/>
    <text x="178" y="262" font-size="21" font-weight="bold" fill="#233943">DEMO QUTI</text>
    <path d="M438 237v42m8-42v42m12-42v42m7-42v42m13-42v42m10-42v42m8-42v42m12-42v42m9-42v42m11-42v42" stroke="#233943" stroke-width="4"/>
  `;
}

function scene(copy, variant) {
  const { angle = 0, background, side, accent } = variant;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500" viewBox="0 0 800 500" font-family="DejaVu Sans">
    <defs>
      <linearGradient id="table" x2="1" y2="1">
        <stop stop-color="${background}"/>
        <stop offset="1" stop-color="#778587"/>
      </linearGradient>
      <filter id="shadow" x="-30%" y="-60%" width="170%" height="245%">
        <feGaussianBlur stdDeviation="17"/>
      </filter>
    </defs>
    <rect width="800" height="500" fill="url(#table)"/>
    <g transform="rotate(${angle} 400 250)">
      <ellipse cx="420" cy="348" rx="271" ry="42" fill="#192722" opacity="0.44" filter="url(#shadow)"/>
      ${side ? packageSide(accent) : packageFace(copy, variant)}
    </g>
  </svg>`;
}

const temporaryDirectory = mkdtempSync(join(tmpdir(), 'shifo-dorimos-'));
const svgPath = join(temporaryDirectory, 'package.svg');
try {
  for (const sample of Object.values(dorimosSamples)) {
    const variant = variants[sample.id];
    const output = new URL(`${sample.id}.png`, destination);
    const blur = variant.blur ? ['-blur', `0x${variant.blur}`] : [];
    writeFileSync(svgPath, scene(labelCopy(sample.expected), variant));
    const render = spawnSync(
      'magick',
      [`RSVG:${svgPath}`, ...blur, '-strip', `PNG24:${fileURLToPath(output)}`],
      { stdio: ['ignore', 'inherit', 'inherit'] },
    );
    if (render.error) throw render.error;
    if (render.status !== 0) throw new Error(`Could not render ${sample.id}`);
  }
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
