import { View } from 'react-native';

import type { HubKind } from '@/background/hubs';
import { hubColors } from '@/ui/theme';

// The same shape and color a hub kind has in the graph, small enough to sit beside text.
export function HubMark({ kind, size = 10 }: { kind: HubKind; size?: number }) {
  const color = hubColors[kind];
  if (kind === 'country') {
    const half = size * 0.58;
    return (
      <View
        style={{
          width: 0,
          height: 0,
          borderLeftWidth: half,
          borderRightWidth: half,
          borderBottomWidth: size,
          borderLeftColor: 'transparent',
          borderRightColor: 'transparent',
          borderBottomColor: color,
        }}
      />
    );
  }
  const side = kind === 'major' ? size * 0.75 : size * 0.9;
  return (
    <View
      style={{
        width: side,
        height: side,
        backgroundColor: color,
        borderRadius: kind === 'school' ? side / 2 : kind === 'company' ? 2 : 1,
        transform: kind === 'major' ? [{ rotate: '45deg' }] : undefined,
        margin: kind === 'major' ? size * 0.12 : 0,
      }}
    />
  );
}
