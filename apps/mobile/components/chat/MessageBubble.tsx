import { StyleSheet } from 'react-native';
import { View, Text } from 'react-native';
import { Image } from 'expo-image';
import { useWindowDimensions } from 'react-native';
import { Colors, Fonts } from '../../constants/theme';
import { ChatMessage } from '../../lib/api';
import { Avatar } from '../ui/Avatar';

const C = Colors.light;

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

export function MessageBubble({ msg, isMe, showTime, showSenderName }: {
  msg: ChatMessage; isMe: boolean; showTime: boolean; showSenderName: boolean;
}) {
  const { width: screenWidth } = useWindowDimensions();
  const mediaWidth = Math.min(220, screenWidth * 0.58);
  const mediaHeight = Math.round(mediaWidth * (180 / 220));
  const isImage = msg.type === 'image';
  const isGif = msg.type === 'gif';
  const isMedia = isImage || isGif;

  return (
    <View style={[styles.bubbleWrap, isMe ? styles.bubbleWrapMe : styles.bubbleWrapThem]}>
      {!isMe && (
        <View style={styles.bubbleWithAvatar}>
          <Avatar
            name={msg.senderName}
            userId={msg.senderId}
            uri={msg.senderImage ?? undefined}
            size="xs"
            style={{ marginRight: 6, alignSelf: 'flex-end', opacity: showTime ? 1 : 0 }}
          />
          <View style={styles.bubbleContent}>
            {showSenderName && (
              <Text style={styles.senderName}>{msg.senderName?.split(' ')[0] ?? 'Someone'}</Text>
            )}
            {isMedia ? (
              <View style={[styles.mediaBubble, styles.mediaBubbleThem]}>
                <Image
                  source={{ uri: msg.content }}
                  style={{ width: mediaWidth, height: mediaHeight }}
                  contentFit="cover"
                  transition={200}
                />
              </View>
            ) : (
              <View style={[styles.bubble, styles.bubbleThem]}>
                <Text style={[styles.bubbleText, styles.bubbleTextThem]}>
                  {msg.content}
                </Text>
              </View>
            )}
            {showTime && (
              <Text style={[styles.timeLabel, styles.timeLabelThem]}>
                {formatTime(msg.createdAt)}
              </Text>
            )}
          </View>
        </View>
      )}
      {isMe && (
        <>
          {isMedia ? (
            <View style={[styles.mediaBubble, styles.mediaBubbleMe]}>
              <Image
                source={{ uri: msg.content }}
                style={{ width: mediaWidth, height: mediaHeight }}
                contentFit="cover"
                transition={200}
              />
            </View>
          ) : (
            <View style={[styles.bubble, styles.bubbleMe]}>
              <Text style={[styles.bubbleText, styles.bubbleTextMe]}>
                {msg.content}
              </Text>
            </View>
          )}
          {showTime && (
            <Text style={[styles.timeLabel, styles.timeLabelMe]}>
              {formatTime(msg.createdAt)}
            </Text>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bubbleWrap: { marginBottom: 6, maxWidth: '82%' },
  bubbleWrapMe: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  bubbleWrapThem: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  bubbleWithAvatar: { flexDirection: 'row', alignItems: 'flex-end' },
  bubbleContent: { flexDirection: 'column', alignItems: 'flex-start' },
  senderName: { fontFamily: Fonts.bodySemiBold, fontSize: 11, color: C.textSecondary, marginBottom: 2, marginLeft: 4 },
  bubble: { borderRadius: 18, paddingVertical: 9, paddingHorizontal: 14 },
  bubbleMe: { backgroundColor: C.primary, borderBottomRightRadius: 4 },
  bubbleThem: { backgroundColor: '#FFFFFF', borderBottomLeftRadius: 4, borderWidth: 1, borderColor: 'rgba(0,0,0,0.07)' },
  bubbleText: { fontFamily: Fonts.body, fontSize: 14, lineHeight: 20 },
  bubbleTextMe: { color: C.textInverse },
  bubbleTextThem: { color: C.text },
  mediaBubble: { borderRadius: 12, overflow: 'hidden' },
  mediaBubbleMe: { borderBottomRightRadius: 4 },
  mediaBubbleThem: { borderBottomLeftRadius: 4 },
  timeLabel: { fontFamily: Fonts.body, fontSize: 11, color: C.textTertiary, marginTop: 2 },
  timeLabelMe: { textAlign: 'right', marginRight: 4 },
  timeLabelThem: { marginLeft: 4 },
});
