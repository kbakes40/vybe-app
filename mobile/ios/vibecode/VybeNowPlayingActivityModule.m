
#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE(VybeNowPlayingActivity, RCTEventEmitter)

RCT_EXTERN_METHOD(startNowPlaying:(NSString *)trackName
                  artistName:(NSString *)artistName
                  artworkUrl:(NSString *)artworkUrl
                  duration:(double)duration
                  albumTitle:(NSString *)albumTitle)

RCT_EXTERN_METHOD(updateNowPlaying:(BOOL)isPlaying
                  progress:(double)progress
                  elapsed:(double)elapsed
                  total:(double)total
                  trackName:(NSString *)trackName
                  artistName:(NSString *)artistName
                  albumTitle:(NSString *)albumTitle)

RCT_EXTERN_METHOD(endNowPlaying)

RCT_EXTERN_METHOD(terminateAllNowPlayingMetadata)

RCT_EXTERN_METHOD(updateAccentColor:(NSString *)hex)

@end
