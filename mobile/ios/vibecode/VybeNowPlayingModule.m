#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE(VybeNowPlaying, RCTEventEmitter)

RCT_EXTERN_METHOD(updateNowPlaying:(NSString *)trackTitle
                  artistName:(NSString *)artistName
                  artworkUrl:(NSString *)artworkUrl
                  duration:(double)duration
                  currentTime:(double)currentTime
                  isPlaying:(BOOL)isPlaying)

RCT_EXTERN_METHOD(updateProgress:(double)currentTime
                  isPlaying:(BOOL)isPlaying)

RCT_EXTERN_METHOD(setArtwork:(NSString *)artworkUrl)

RCT_EXTERN_METHOD(setArtworkBase64:(NSString *)base64String)

RCT_EXTERN_METHOD(startKeepAlive:(double)elapsed
                  isPlaying:(BOOL)isPlaying)

RCT_EXTERN_METHOD(stopKeepAlive)

RCT_EXTERN_METHOD(clearNowPlaying)

RCT_EXTERN_METHOD(showRoutePicker)

@end
