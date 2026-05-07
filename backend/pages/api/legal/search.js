// pages/api/legal/search.js
import { rechercher } from '../../../lib/legifrance';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { query, fond } = req.body;
    const result = await rechercher(query, fond);
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}