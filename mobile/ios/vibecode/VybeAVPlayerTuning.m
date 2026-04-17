#import <AVFoundation/AVFoundation.h>
#import <objc/runtime.h>

/// Tunes all AVQueuePlayer instances created by expo-av for faster time-to-first-sample.
@implementation AVQueuePlayer (VybeInstantStart)

+ (void)load
{
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{
    Class cls = [AVQueuePlayer class];
    Method orig = class_getClassMethod(cls, @selector(queuePlayerWithItems:));
    Method swz = class_getClassMethod(cls, @selector(vybe_queuePlayerWithItems:));
    if (orig && swz) {
      method_exchangeImplementations(orig, swz);
    }
  });
}

+ (instancetype)vybe_queuePlayerWithItems:(NSArray<AVPlayerItem *> *)items
{
  AVQueuePlayer *player = [self vybe_queuePlayerWithItems:items];
  if (player) {
    if (@available(iOS 10.0, *)) {
      player.automaticallyWaitsToMinimizeStalling = NO;
    }
  }
  return player;
}

@end

@implementation AVURLAsset (VybeInstantStart)

+ (void)load
{
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{
    Class cls = [AVURLAsset class];
    Method orig = class_getClassMethod(cls, @selector(URLAssetWithURL:options:));
    Method swz = class_getClassMethod(cls, @selector(vybe_URLAssetWithURL:options:));
    if (orig && swz) {
      method_exchangeImplementations(orig, swz);
    }
  });
}

+ (instancetype)vybe_URLAssetWithURL:(NSURL *)URL options:(NSDictionary<NSString *, id> *)options
{
  NSMutableDictionary *opts = options ? [options mutableCopy] : [NSMutableDictionary dictionary];
  opts[AVURLAssetPreferPreciseDurationAndTimingKey] = @NO;
  return [self vybe_URLAssetWithURL:URL options:opts];
}

@end

@implementation AVPlayer (VybeInstantStartInit)

+ (void)load
{
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{
    Class cls = [AVPlayer class];
    Method orig = class_getInstanceMethod(cls, @selector(initWithPlayerItem:));
    Method swz = class_getInstanceMethod(cls, @selector(vybe_initWithPlayerItem:));
    if (orig && swz) {
      method_exchangeImplementations(orig, swz);
    }
  });
}

- (instancetype)vybe_initWithPlayerItem:(AVPlayerItem *)item
{
  AVPlayer *player = [self vybe_initWithPlayerItem:item];
  if (player) {
    if (@available(iOS 10.0, *)) {
      player.automaticallyWaitsToMinimizeStalling = NO;
    }
  }
  return player;
}

@end

/// expo-av builds AVPlayerItem via initWithAsset: — tune buffer + peak for fast start.
@implementation AVPlayerItem (VybeFastStart)

+ (void)load
{
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{
    Class cls = [AVPlayerItem class];
    Method orig = class_getInstanceMethod(cls, @selector(initWithAsset:automaticallyLoadedAssetKeys:));
    Method swz = class_getInstanceMethod(cls, @selector(vybe_initWithAsset:automaticallyLoadedAssetKeys:));
    if (orig && swz) {
      method_exchangeImplementations(orig, swz);
    }
  });
}

- (instancetype)vybe_initWithAsset:(AVAsset *)asset automaticallyLoadedAssetKeys:(NSArray<NSString *> *)automaticallyLoadedAssetKeys
{
  AVPlayerItem *item = [self vybe_initWithAsset:asset automaticallyLoadedAssetKeys:automaticallyLoadedAssetKeys];
  if (item) {
    item.preferredPeakBitRate = 0;
    item.preferredForwardBufferDuration = 0.45;
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(2.0 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
      @try {
        item.preferredForwardBufferDuration = 2.0;
      } @catch (__unused NSException *e) {}
    });
  }
  return item;
}

@end
