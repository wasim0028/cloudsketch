#!/usr/bin/env node
// Copy official cloud icons into public/icons/<key>.svg.
//
// Usage: node scripts/import-icons.mjs <aws|gcp|azure> <unzipped-icon-pack-dir>
//   (run once per vendor pack so e.g. Azure "Functions" never matches a GCP file)
//
// Download the packs yourself (each vendor has its own usage terms):
//   AWS:   https://aws.amazon.com/architecture/icons/
//   Azure: https://learn.microsoft.com/azure/architecture/icons/
//   GCP:   https://cloud.google.com/icons
//
// Matching: each key in backend/app/prompts/icons.json is matched to the SVG whose
// normalized file name best contains the icon's label words (e.g. "eks" -> the
// "Elastic-Kubernetes-Service" file via ALIASES). Unmatched keys are listed so you
// can add an alias or copy the file by hand. Missing icons fall back to glyph tiles.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const icons = JSON.parse(fs.readFileSync(path.join(here, '../../backend/app/prompts/icons.json'), 'utf8'))
const outDir = path.join(here, '../public/icons')

// Extra search terms where the vendor file name differs from our label
const ALIASES = {
  'aws-eks': ['elastic kubernetes service'],
  'aws-ecs': ['elastic container service'],
  'aws-ec2': ['ec2'],
  'aws-elb': ['elastic load balancing'],
  'aws-ecr': ['elastic container registry'],
  'aws-elasticache': ['elasticache'],
  'aws-sqs': ['simple queue service'],
  'aws-sns': ['simple notification service'],
  'aws-s3': ['simple storage service'],
  'aws-iam': ['identity and access management'],
  'aws-cloud': ['aws cloud'],
  'aws-subnet-public': ['public subnet'],
  'aws-subnet-private': ['private subnet'],
  'aws-vpc': ['virtual private cloud'],
  'aws-nat-gateway': ['nat gateway'],
  'gcp-gke': ['google kubernetes engine', 'gke'],
  'gcp-pubsub': ['pubsub', 'pub sub'],
  'azure-aks': ['kubernetes services'],
  'azure-vnet': ['virtual networks'],
  'azure-vm': ['virtual machine'],
  'azure-sql': ['sql database'],
  'azure-cache-redis': ['cache redis'],
}

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (e.name.toLowerCase().endsWith('.svg')) out.push(p)
  }
  return out
}

const [vendor, dir] = process.argv.slice(2)
if (!['aws', 'gcp', 'azure'].includes(vendor) || !dir) {
  console.error('Usage: node scripts/import-icons.mjs <aws|gcp|azure> <icon-pack-dir>')
  process.exit(1)
}
const files = walk(dir).map((f) => ({ f, n: norm(path.basename(f, '.svg')) }))
fs.mkdirSync(outDir, { recursive: true })

const missing = []
for (const icon of icons.filter((i) => i.provider === vendor)) {
  const terms = [...(ALIASES[icon.key] ?? []), norm(icon.label)]
  const candidates = files.filter(({ n }) => terms.some((t) => n.includes(t))).sort((a, b) => score(b) - score(a))
  if (!candidates.length) { missing.push(icon.key); continue }
  fs.copyFileSync(candidates[0].f, path.join(outDir, `${icon.key}.svg`))
  console.log(`${icon.key.padEnd(24)} <- ${path.basename(candidates[0].f)}`)
}

function score({ f, n }) {
  let s = 0
  if (/48/.test(n)) s += 3 // prefer 48px variants
  if (/arch|architecture/.test(norm(f))) s += 2
  if (/dark/.test(n)) s -= 2
  return s - n.length / 100 // shorter, more specific names win ties
}

if (missing.length) console.log(`\nNo match (falls back to glyph tile): ${missing.join(', ')}`)
