import { useAssets } from 'expo-asset';
import { useEffect, useState } from 'react';
import { SvgXml } from 'react-native-svg';
import { StyleSheet, View } from 'react-native';
import { colors } from '../constants/theme';
import type { PrayerPose, PrayerStage } from '../types/prayer';

const poseIconAssets: Partial<Record<PrayerPose, number>> = {
  STANDING: require('../icons/قيام.svg'),
  BOWING: require('../icons/ركوع.svg'),
  PROSTRATING: require('../icons/سجود.svg'),
  SITTING: require('../icons/جلوس.svg'),
};
const iconModules = Object.values(poseIconAssets);

// Normalized crop bounds measured from the real SVG artwork, including a small safe padding.
// They remove the large empty margins in each source viewBox without altering the source files.
const viewBoxCrops: Partial<Record<PrayerPose, [number, number, number, number]>> = {
  STANDING: [0.4352, 0.3153, 0.1659, 0.3226],
  BOWING: [0.4032, 0.4206, 0.2474, 0.233],
  PROSTRATING: [0.3532, 0.4844, 0.2813, 0.1556],
  SITTING: [0.3962, 0.3468, 0.1869, 0.2743],
};

type PrayerPoseIconProps = {
  pose: PrayerPose | null;
  stage: PrayerStage;
  size?: number;
};

function replaceExplicitBlackColors(svg: string) {
  return svg
    .replace(/\b(fill|stroke)=(['"])(#000(?:000)?|black)\2/gi, `$1=$2${colors.brassSoft}$2`)
    .replace(/\b(fill|stroke)\s*:\s*(#000(?:000)?|black)/gi, `$1: ${colors.brassSoft}`);
}

function cropSvgViewBox(svg: string, pose: PrayerPose | null) {
  const crop = pose ? viewBoxCrops[pose] : undefined;
  const viewBoxMatch = svg.match(/\bviewBox=(['"])([^'"]+)\1/i);
  if (!crop || !viewBoxMatch) return svg;

  const values = viewBoxMatch[2].trim().split(/[\s,]+/).map(Number);
  if (values.length !== 4 || values.some((value) => !Number.isFinite(value))) return svg;

  const [minX, minY, width, height] = values;
  const [x, y, cropWidth, cropHeight] = crop;
  const croppedViewBox = [
    minX + width * x,
    minY + height * y,
    width * cropWidth,
    height * cropHeight,
  ].join(' ');

  return svg.replace(/\bviewBox=(['"])[^'"]+\1/i, `viewBox=${viewBoxMatch[1]}${croppedViewBox}${viewBoxMatch[1]}`);
}

export function PrayerPoseIcon({ pose, stage, size = 56 }: PrayerPoseIconProps) {
  const [assets] = useAssets(iconModules);
  const [loadedIcon, setLoadedIcon] = useState<{ uri: string; xml: string } | null>(null);
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const displayPose = stage === 'ITIDAL' && pose === 'STANDING' ? 'STANDING' : pose;
  const iconModule = displayPose ? poseIconAssets[displayPose] : undefined;
  const assetIndex = iconModule ? iconModules.indexOf(iconModule) : -1;
  const asset = assetIndex >= 0 ? assets?.[assetIndex] : undefined;
  const uri = asset?.localUri;

  useEffect(() => {
    if (!uri) return;

    let cancelled = false;

    void fetch(uri)
      .then((response) => {
        if (!response.ok) throw new Error('Unable to load pose SVG');
        return response.text();
      })
      .then((xml) => {
        if (!cancelled) {
          const coloredXml = replaceExplicitBlackColors(xml);
          setLoadedIcon({ uri, xml: cropSvgViewBox(coloredXml, displayPose) });
        }
      })
      .catch(() => {
        if (!cancelled) setFailedUri(uri);
      });

    return () => {
      cancelled = true;
    };
  }, [displayPose, uri]);

  const renderedXml =
    uri && loadedIcon?.uri === uri && failedUri !== uri ? loadedIcon.xml : null;

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      {renderedXml ? (
        <SvgXml
          xml={renderedXml}
          width={size}
          height={size}
          style={styles.mirroredSvg}
          override={{
            fill: colors.brassSoft,
            color: colors.brassSoft,
            preserveAspectRatio: 'xMidYMid meet',
          }}
          onError={() => setFailedUri(uri ?? null)}
        />
      ) : (
        <View style={styles.placeholder} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center' },
  mirroredSvg: { transform: [{ scaleX: -1 }] },
  placeholder: { width: '100%', height: '100%' },
});
