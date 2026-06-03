import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { ServerBridge } from '../../services/ServerBridge';
import { getLocalIpAddress } from '../../utils/networkInfo';

type ServerStatus = 'idle' | 'starting' | 'running' | 'error' | 'stopped';

interface Props {
  institutionId: number;
}

export function ServerStatusCard({ institutionId }: Props) {
  const [status, setStatus] = useState<ServerStatus>(() => ServerBridge.isRunning() ? 'running' : 'idle');
  const [detail, setDetail] = useState('');
  const [ip, setIp] = useState('');
  const port = 3000;

  useEffect(() => {
    getLocalIpAddress().then(setIp);

    ServerBridge.setStatusCallback((s, d) => {
      setStatus(s);
      if (d) setDetail(d);
    });

    return () => { ServerBridge.setStatusCallback(null); };
  }, []);

  const handleStart = () => {
    ServerBridge.start(institutionId, (s, d) => {
      setStatus(s);
      if (d) setDetail(d);
    });
  };

  const handleStop = () => {
    ServerBridge.stop();
    setStatus('stopped');
  };

  const statusColor: Record<ServerStatus, string> = {
    idle: '#94A3B8',
    starting: '#D97706',
    running: '#16A34A',
    error: '#DC2626',
    stopped: '#64748B',
  };

  const isRunning = status === 'running';

  return (
    <View
      className="bg-white rounded-xl p-4 mt-3"
      style={{
        elevation: 1,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
      }}
    >
      <View className="flex-row items-center gap-2">
        <View
          className="w-[10px] h-[10px] rounded-full"
          style={{ backgroundColor: statusColor[status] }}
        />
        <Text className="flex-1 text-sm text-[#374151] font-medium">
          Server{' '}
          {status === 'idle' ? 'not started'
            : status === 'starting' ? 'starting...'
            : status === 'running' ? 'running'
            : status === 'error' ? `error: ${detail}`
            : 'stopped'}
        </Text>
        <TouchableOpacity
          className={`rounded-lg px-[14px] py-[7px] ${isRunning ? 'bg-[#DC2626]' : 'bg-[#2563EB]'}`}
          onPress={isRunning ? handleStop : handleStart}
        >
          <Text className="text-white font-semibold text-[13px]">{isRunning ? 'Stop' : 'Start'}</Text>
        </TouchableOpacity>
      </View>

      {isRunning && ip && ip !== '0.0.0.0' && (
        <View className="mt-3 bg-[#F0FDF4] rounded-lg p-3">
          <Text className="text-xs text-[#16A34A] font-semibold">Clients connect to:</Text>
          <Text className="text-xl font-bold text-[#15803D] tracking-widest mt-0.5">{ip}:{port}</Text>
          <Text className="text-[11px] text-[#4ADE80] mt-1">Share this with students/teachers on the same Wi-Fi</Text>
        </View>
      )}
    </View>
  );
}
