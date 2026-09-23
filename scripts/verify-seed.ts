import { MongoClient } from 'mongodb';

async function main(): Promise<void> {
  const c = new MongoClient('mongodb://127.0.0.1:27017');
  await c.connect();
  const db = c.db('flowforge');

  const names = (await db.listCollections().toArray()).map((x) => x.name).sort();
  console.log('COLLECTIONS');
  for (const n of names) {
    console.log(`  ${n.padEnd(22)} ${await db.collection(n).countDocuments()}`);
}

  console.log('');
  const ws = await db.collection('workspaces').findOne({});
  console.log('WORKSPACE:', ws?.name, '| slug:', ws?.slug);

  console.log('');
  console.log('WORKFLOWS');
  for (const w of await db.collection('workflows').find({}).toArray()) {
    console.log(
      `  ${String(w.name).padEnd(32)} ${String(w.status).padEnd(9)} nodes=${w.nodes.length} edges=${w.edges.length} v${w.currentVersion}`,
    );
}

  console.log('');
  const tasks = await db
    .collection('tasks')
    .aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }, { $sort: { _id: 1 } }])
    .toArray();
  console.log('TASKS BY STATUS:', tasks.map((t) => `${t._id}=${t.n}`).join('  '));

  console.log('');
  console.log('EXECUTIONS:', await db.collection('workflowexecutions').countDocuments());
  const ex = await db.collection('workflowexecutions').findOne({});
  if (ex) {
    console.log(
      `  status=${ex.status} current=${ex.currentNodeIds?.length ?? 0} completed=${ex.completedNodeIds?.length ?? 0}`,
    );
}
  console.log('VERSIONS:', await db.collection('workflowversions').countDocuments());
  console.log('NOTIFICATIONS:', await db.collection('notifications').countDocuments());
  console.log('ACTIVITY:', await db.collection('activities').countDocuments());
  console.log('AUDIT:', await db.collection('auditlogs').countDocuments());
  console.log('TEMPLATES:', await db.collection('templates').countDocuments());
  console.log(
    'AUTH account:',
    await db.collection('account').countDocuments(),
    '| session:',
    await db.collection('session').countDocuments(),
  );

  console.log('');
  console.log('INDEXES (tasks):', (await db.collection('tasks').indexes()).map((i) => i.name).join(', '));
  console.log('INDEXES (memberships):', (await db.collection('memberships').indexes()).map((i) => i.name).join(', '));

  await c.close();
}

main().catch((e: unknown) => { console.error(e); process.exit(1); });
