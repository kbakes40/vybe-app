import React from 'react';
import { View, Text, Pressable, Modal } from 'react-native';
import { AlertCircle, X } from 'lucide-react-native';

interface ExternalDownloadAlertProps {
  visible: boolean;
  onClose: () => void;
  sourceName: string;
  onOpenSource: () => void;
}

export function ExternalDownloadAlert({
  visible,
  onClose,
  sourceName,
  onOpenSource,
}: ExternalDownloadAlertProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        className="flex-1 bg-black/70 items-center justify-center px-6"
        onPress={onClose}
      >
        <Pressable
          className="bg-[#282828] rounded-2xl w-full max-w-sm overflow-hidden"
          onPress={e => e.stopPropagation()}
        >
          {/* Header */}
          <View className="flex-row items-center justify-between p-4 border-b border-white/10">
            <View className="flex-row items-center">
              <AlertCircle size={20} color="#FF9500" />
              <Text className="text-white font-semibold text-base ml-2">
                Download Not Available
              </Text>
            </View>
            <Pressable onPress={onClose} className="p-1">
              <X size={20} color="#B3B3B3" />
            </Pressable>
          </View>

          {/* Content */}
          <View className="p-5">
            <Text className="text-white/90 text-base leading-6">
              Vault import is available for VYBE tracks only.
            </Text>
            <Text className="text-white/60 text-sm mt-3 leading-5">
              This track plays from {sourceName}. Use the button below for platform options including Vault-style local playback where supported.
            </Text>
          </View>

          {/* Actions */}
          <View className="p-4 pt-0 gap-3">
            <Pressable
              onPress={() => {
                onOpenSource();
                onClose();
              }}
              className="bg-white py-3.5 rounded-full items-center"
            >
              <Text className="text-black font-semibold text-base">
                Open in {sourceName}
              </Text>
            </Pressable>
            <Pressable
              onPress={onClose}
              className="py-3 items-center"
            >
              <Text className="text-white/60 font-medium">
                Got it
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
