#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(VybeDownloadActivity, NSObject)

RCT_EXTERN_METHOD(startActivity:(NSString *)trackTitle
                  artistName:(NSString *)artistName)

RCT_EXTERN_METHOD(updateProgress:(double)progress
                  statusText:(NSString *)statusText)

RCT_EXTERN_METHOD(endActivity:(BOOL)success)

@end
