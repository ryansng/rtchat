import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:rtchat/models/channels.dart';

class NameCardScreen extends StatelessWidget {
  const NameCardScreen({Key? key}) : super(key: key); // wat is dis?

  void authenticate(BuildContext context) {} // is this necessary?

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Name Card'),
      ),
      body: Consumer<ChannelsModel>(builder: (context, channelsModel, child) {
        if (channelsModel.subscribedChannels.isEmpty) {
          // is this necessary
          return const Spacer();
        }
        final first = channelsModel.subscribedChannels.first;
        return Center(
          child: Column(
              crossAxisAlignment: CrossAxisAlignment.center,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Center(
                  child: QrImage(
                    data: 'www.twitch.tv/${first.displayName}',
                    backgroundColor: Colors.white,
                    version: QrVersions.auto,
                    size: 250,
                    gapless: true,
                    embeddedImage: const AssetImage('assets/logo_qr_mono.png'),
                    embeddedImageStyle: QrEmbeddedImageStyle(
                      size: const Size(55, 55),
                    ),
                    embeddedImageEmitsError: false,
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.all(8),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Padding(
                        padding: const EdgeInsets.only(right: 8),
                        child: Image(
                          height: 30,
                          image: AssetImage(
                              'assets/providers/${first.provider}.png'),
                        ),
                      ),
                      const Text(
                        'twitch.tv',
                        style: TextStyle(fontSize: 30),
                      )
                    ],
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 50),
                  child: Text(
                    first.displayName,
                    style: const TextStyle(
                      fontSize: 25,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ]),
        );
      }),
    );
  }
}

// Things to note: Twitch channel username max length is 25 characters.