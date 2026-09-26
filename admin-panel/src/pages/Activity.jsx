import { useEffect, useState } from 'react';
import { History } from 'lucide-react';
import { watch, orderBy, limit } from '../lib/data';
import { useAdmin } from '../context';
import { fmtDateTime } from '../lib/format';
import { PageHead, Loading, Empty, Badge } from '../components/ui';

const COLORS = { create: 'green', renew: 'indigo', revoked: 'red', suspended: 'amber', active: 'green', delete: 'red', update: 'blue', signing: 'indigo', save: 'blue', remove: 'red' };

export default function Activity() {
  const { toastError } = useAdmin();
  const [rows, setRows] = useState(null);
  useEffect(() => watch('activity', setRows, toastError, orderBy('at', 'desc'), limit(300)), [toastError]);
  if (!rows) return <Loading />;
  return (
    <div className="col" style={{ gap: 16 }}>
      <PageHead title="Activity log" sub="Every change made in the Super Admin panel (latest 300)." />
      <div className="card">
        {rows.length === 0 ? (
          <Empty icon={History} title="No activity yet" />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>When</th><th>Action</th><th>Detail</th><th className="hide-sm">By</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="nowrap muted">{fmtDateTime(r.at)}</td>
                    <td><Badge color={COLORS[String(r.action).split('.')[1]]}>{r.action}</Badge></td>
                    <td>{r.detail}</td>
                    <td className="hide-sm muted">{r.by}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
