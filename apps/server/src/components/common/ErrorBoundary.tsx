import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  children: React.ReactNode;
  fallbackTitle?: string;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const title = this.props.fallbackTitle ?? 'Something went wrong';

    return (
      <View className="flex-1 bg-bio justify-center items-center px-6">
        <Ionicons name="warning-outline" size={48} color="#2A5C33" />
        <Text className="text-brand text-xl font-bold mt-4 text-center">{title}</Text>
        <Text className="text-slate-500 text-sm mt-2 text-center">{error.message}</Text>
        <ScrollView
          className="mt-4 max-h-32 w-full bg-mint rounded-lg px-3 py-2"
          showsVerticalScrollIndicator
        >
          <Text className="text-xs text-slate-600 font-mono">{error.stack}</Text>
        </ScrollView>
        <TouchableOpacity
          className="mt-6 bg-brand px-6 py-3 rounded-2xl"
          onPress={this.reset}
          activeOpacity={0.8}
        >
          <Text className="text-white font-semibold">Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }
}
