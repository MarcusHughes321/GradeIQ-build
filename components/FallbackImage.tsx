import { Image, ImageProps } from "expo-image";
import React, { useEffect, useState } from "react";
import { View, StyleSheet, StyleProp, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

type FallbackImageProps = Omit<ImageProps, "source"> & {
  localUri?: string | null;
  remoteUri?: string | null;
  placeholderIconSize?: number;
};

/**
 * Renders the local (on-device) image first for speed, and automatically falls
 * back to the server-backed URL if the local file fails to load. This matters
 * because iOS purges the app's cache directory (where camera / manipulated card
 * photos live), leaving a non-empty-but-dead file:// path. A plain
 * `localUri || remoteUri` never recovers in that case; this component does.
 *
 * When there is neither a usable local nor a remote source (or both fail to
 * load), it shows an honest "photo unavailable" placeholder instead of a blank
 * box — so a grade whose photo was genuinely purged never looks broken.
 */
export function FallbackImage({ localUri, remoteUri, placeholderIconSize = 20, ...rest }: FallbackImageProps) {
  const [uri, setUri] = useState<string>(localUri || remoteUri || "");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setUri(localUri || remoteUri || "");
    setFailed(false);
  }, [localUri, remoteUri]);

  if (!uri || failed) {
    return (
      <View style={[styles.placeholder, rest.style as StyleProp<ViewStyle>]}>
        <Ionicons name="image-outline" size={placeholderIconSize} color={Colors.textMuted} />
      </View>
    );
  }

  return (
    <Image
      {...rest}
      source={{ uri }}
      onError={(e) => {
        if (remoteUri && uri !== remoteUri) {
          setUri(remoteUri);
        } else {
          setFailed(true);
        }
        rest.onError?.(e);
      }}
    />
  );
}

const styles = StyleSheet.create({
  placeholder: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.surface,
  },
});
