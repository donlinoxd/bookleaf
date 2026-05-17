import { View, Text } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

const ROLE_COLOR: Record<string, string> = {
  admin: '#7C3AED',
  librarian: '#2563EB',
  member: '#16A34A',
};

interface Props {
  name: string;
  idNumber: string;
  role: string;
  institutionName: string;
  qrSize?: number;
  getRef?: (ref: { toDataURL: (cb: (data: string) => void) => void } | null) => void;
}

export function MemberCard({ name, idNumber, role, institutionName, qrSize = 120, getRef }: Props) {
  const color = ROLE_COLOR[role] ?? '#64748B';

  return (
    <View
      className="rounded-[14px] overflow-hidden border border-[#E2E8F0] bg-white"
      style={{
        elevation: 3,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
      }}
    >
      <View className="bg-[#1E293B] px-4 py-3">
        <Text className="text-white text-sm font-bold" numberOfLines={1}>{institutionName}</Text>
        <Text className="text-[#94A3B8] text-[10px] mt-0.5 tracking-widest">LIBRARY CARD</Text>
      </View>
      <View className="flex-row p-4 gap-4 items-center">
        <View className="flex-1 gap-1">
          <View
            className="w-11 h-11 rounded-full items-center justify-center mb-1.5"
            style={{ backgroundColor: color + '20' }}
          >
            <Text className="text-xl font-bold" style={{ color }}>{name.charAt(0).toUpperCase()}</Text>
          </View>
          <Text className="text-base font-bold text-[#1E293B]" numberOfLines={2}>{name}</Text>
          <View
            className="self-start rounded px-2 py-[3px] mt-0.5"
            style={{ backgroundColor: color + '20' }}
          >
            <Text className="text-[10px] font-bold tracking-[0.5px]" style={{ color }}>{role.toUpperCase()}</Text>
          </View>
          <Text className="text-[10px] text-[#94A3B8] mt-2 tracking-widest">ID NUMBER</Text>
          <Text className="text-[15px] font-bold text-[#1E293B] tracking-widest" style={{ fontVariant: ['tabular-nums'] }}>{idNumber}</Text>
        </View>
        <View className="items-center justify-center">
          <QRCode
            value={idNumber}
            size={qrSize}
            color="#1E293B"
            backgroundColor="white"
            getRef={getRef}
          />
        </View>
      </View>
    </View>
  );
}
