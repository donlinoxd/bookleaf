import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import QRCode from 'react-qr-code';
import { Copy, Check } from 'lucide-react';
import { useTRPC } from '@/lib/trpc';
import { useAuthStore } from '@/store/useAuthStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

type GateLog = {
  id: number;
  user_name: string;
  user_id_number: string;
  direction: string;
  method: string;
  logged_at: string;
};

function formatTime(logged_at: string): string {
  const d = new Date(logged_at);
  const today = new Date();
  const isToday =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  return isToday ? d.toLocaleTimeString() : d.toLocaleString();
}

export default function Gate() {
  const trpc = useTRPC();
  const { user } = useAuthStore();
  const iid = user?.institution_id ?? 1;

  const [serverUrl, setServerUrl] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch('http://localhost:3000/info')
      .then(r => r.json())
      .then((d: { serverUrl?: string | null }) => {
        if (d.serverUrl) setServerUrl(d.serverUrl);
      })
      .catch(() => {});
  }, []);

  const { data: logs = [], isLoading } = useQuery({
    ...trpc.admin.gate.recentLogs.queryOptions({ institutionId: iid, limit: 50 }),
    refetchInterval: 10_000,
  });

  const gateLogs = logs as GateLog[];

  function handleCopy() {
    navigator.clipboard.writeText(serverUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="p-6 flex gap-6 h-full">
      {/* Left panel — QR code */}
      <div className="w-1/3 min-w-[240px] max-w-xs flex-shrink-0">
        <Card className="h-fit">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Server Connection</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-center rounded-lg bg-white p-4 border">
              <QRCode value={serverUrl} size={180} fgColor="#2A5C33" />
            </div>

            <div className="space-y-1">
              <Input
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                className="text-xs font-mono"
                placeholder="http://192.168.1.5:3000"
              />
            </div>

            <Button
              variant="outline"
              size="sm"
              className="w-full gap-2"
              onClick={handleCopy}
            >
              {copied ? (
                <>
                  <Check size={14} className="text-green-600" />
                  <span className="text-green-600">Copied!</span>
                </>
              ) : (
                <>
                  <Copy size={14} />
                  Copy URL
                </>
              )}
            </Button>

            <p className="text-xs text-muted-foreground leading-relaxed">
              Patrons scan this QR code to connect their Bookleaf app to this
              server. Enter the LAN IP address above so patrons on the same
              Wi-Fi network can reach this device.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Right panel — gate log table */}
      <div className="flex-1 min-w-0">
        <div className="space-y-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Recent Gate Activity</h1>
            <p className="text-muted-foreground text-sm mt-1">Auto-refreshes every 10 seconds</p>
          </div>

          <div className="rounded-md border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  {['Member', 'ID', 'Direction', 'Method', 'Time'].map((col) => (
                    <th
                      key={col}
                      className="text-left px-3 py-2 font-medium text-muted-foreground text-xs uppercase tracking-wider"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {isLoading ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                      Loading…
                    </td>
                  </tr>
                ) : gateLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                      No gate activity yet
                    </td>
                  </tr>
                ) : (
                  gateLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-muted/30">
                      <td className="px-3 py-2 font-medium">{log.user_name}</td>
                      <td className="px-3 py-2 text-muted-foreground font-mono text-xs">
                        {log.user_id_number}
                      </td>
                      <td className="px-3 py-2">
                        {log.direction === 'in' ? (
                          <Badge className="bg-green-100 text-green-800 border-green-200 hover:bg-green-100">
                            IN
                          </Badge>
                        ) : (
                          <Badge className="bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100">
                            OUT
                          </Badge>
                        )}
                      </td>
                      <td className="px-3 py-2 capitalize text-muted-foreground">{log.method}</td>
                      <td className="px-3 py-2 text-muted-foreground text-xs tabular-nums">
                        {formatTime(log.logged_at)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
