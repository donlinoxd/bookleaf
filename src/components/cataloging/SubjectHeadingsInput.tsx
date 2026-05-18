import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  headings: string[];
  onChange: (headings: string[]) => void;
  placeholder?: string;
}

export function SubjectHeadingsInput({ headings, onChange, placeholder = 'Add subject heading…' }: Props) {
  const [input, setInput] = useState('');

  const add = () => {
    const val = input.trim();
    if (!val || headings.includes(val)) { setInput(''); return; }
    onChange([...headings, val]);
    setInput('');
  };

  const remove = (heading: string) => {
    onChange(headings.filter((h) => h !== heading));
  };

  return (
    <View className="gap-2">
      <View className="flex-row gap-2">
        <TextInput
          className="flex-1 bg-white border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]"
          value={input}
          onChangeText={setInput}
          placeholder={placeholder}
          placeholderTextColor="#94A3B8"
          onSubmitEditing={add}
          returnKeyType="done"
          blurOnSubmit={false}
        />
        <TouchableOpacity
          className="bg-brand rounded-xl px-4 justify-center"
          onPress={add}
        >
          <Ionicons name="add" size={20} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {headings.length > 0 && (
        <View className="flex-row flex-wrap gap-2">
          {headings.map((h) => (
            <View key={h} className="flex-row items-center gap-1 bg-mint rounded-lg px-2.5 py-1.5">
              <Text className="text-xs font-semibold text-brand">{h}</Text>
              <TouchableOpacity onPress={() => remove(h)} hitSlop={6}>
                <Ionicons name="close-circle" size={14} color="#2A5C33" />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
