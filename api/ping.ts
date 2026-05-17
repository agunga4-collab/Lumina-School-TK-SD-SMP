export default function handler(req, res) {
  res.status(200).json({ status: 'pong', time: new Date().toISOString() });
}
