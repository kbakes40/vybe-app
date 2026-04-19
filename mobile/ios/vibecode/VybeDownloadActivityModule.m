#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(VybeDownloadActivity, NSObject)

RCT_EXTERN_METHOD(startActivity:(NSString *)trackTitle
                  artistName:(NSString *)artistName
                  artworkURL:(NSString *)artworkURL)

RCT_EXTERN_METHOD(updateProgress:(double)progress
                  statusText:(NSString *)statusText
                  recentPosts:(NSArray *_Nullable)recentPosts)

RCT_EXTERN_METHOD(endActivity:(BOOL)success)

RCT_EXTERN_METHOD(terminateAllActivities)

@end
