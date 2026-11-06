/**
 * Data-access layer. Uses MongoDB (Mongoose) when connected, otherwise a simple
 * in-memory store so the project runs and can be tested without a database.
 * All business logic lives in controllers and works identically on both.
 */
const Visitor = require('../models/Visitor');
const User = require('../models/User');

let useMongo = false;
const mem = { visitors: [], users: [] };

const clean = (doc) => {
  if (!doc) return null;
  const { _id, __v, tokenHash, ...rest } = doc;
  return rest;
};

exports.setMode = (mongo) => { useMongo = mongo; };
exports.mode = () => (useMongo ? 'mongodb' : 'memory');

// ---------- Visitors ----------
exports.createVisitor = async (doc) => {
  if (useMongo) { await Visitor.create(doc); return clean(doc); }
  mem.visitors.push({ ...doc, events: doc.events || [] });
  return clean(doc);
};

exports.findVisitor = async (visitorId, { withToken = false } = {}) => {
  if (useMongo) {
    const d = await Visitor.findOne({ visitorId }).select('+tokenHash').lean();
    return withToken ? d : clean(d);
  }
  const d = mem.visitors.find((v) => v.visitorId === visitorId);
  return d ? (withToken ? { ...d } : clean({ ...d })) : null;
};

/** set: fields to set; event: optional {type,message} appended to the audit trail */
exports.updateVisitor = async (visitorId, set, event) => {
  const ev = event ? { ...event, at: new Date() } : null;
  if (useMongo) {
    const update = { $set: set };
    if (ev) update.$push = { events: ev };
    return clean(await Visitor.findOneAndUpdate({ visitorId }, update, { new: true }).lean());
  }
  const d = mem.visitors.find((v) => v.visitorId === visitorId);
  if (!d) return null;
  Object.assign(d, set);
  if (ev) d.events.push(ev);
  return clean({ ...d });
};

exports.allVisitors = async () => {
  if (useMongo) return (await Visitor.find().sort({ startedAt: -1 }).limit(1000).lean()).map(clean).filter(Boolean);
  return [...mem.visitors].sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt)).map(clean).filter(Boolean);
};

exports.deleteVisitor = async (visitorId) => {
  if (useMongo) return (await Visitor.deleteOne({ visitorId })).deletedCount > 0;
  const n = mem.visitors.length;
  mem.visitors = mem.visitors.filter((v) => v.visitorId !== visitorId);
  return mem.visitors.length < n;
};

exports.deleteVisitorsWhere = async ({ before, simulatedOnly }) => {
  const q = {};
  if (before) q.startedAt = { $lt: before };
  if (simulatedOnly) q.isSimulated = true;
  if (useMongo) return (await Visitor.deleteMany(q)).deletedCount;
  const n = mem.visitors.length;
  mem.visitors = mem.visitors.filter((v) => {
    const match = (!before || new Date(v.startedAt) < before) && (!simulatedOnly || v.isSimulated);
    return !match;
  });
  return n - mem.visitors.length;
};

exports.countVisitors = async () => (useMongo ? Visitor.countDocuments() : mem.visitors.length);

// ---------- Users ----------
exports.findUserByEmail = async (email) => {
  const e = String(email || '').toLowerCase().trim();
  if (useMongo) return User.findOne({ email: e }).lean();
  return mem.users.find((u) => u.email === e) || null;
};

exports.upsertUser = async (email, passwordHash) => {
  const e = email.toLowerCase().trim();
  if (useMongo) {
    return User.findOneAndUpdate({ email: e }, { email: e, passwordHash, role: 'admin' }, { upsert: true, new: true }).lean();
  }
  const existing = mem.users.find((u) => u.email === e);
  if (existing) { existing.passwordHash = passwordHash; return existing; }
  const u = { _id: e, email: e, passwordHash, role: 'admin' };
  mem.users.push(u);
  return u;
};
