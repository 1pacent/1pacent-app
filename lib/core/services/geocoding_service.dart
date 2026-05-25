import 'dart:convert';
import 'dart:math';

import 'package:http/http.dart' as http;

import '../config/app_config.dart';

class GeocodedLocation {
  const GeocodedLocation({
    required this.latitude,
    required this.longitude,
    required this.displayName,
    this.address,
  });

  final double latitude;
  final double longitude;
  final String displayName;
  final String? address;

  factory GeocodedLocation.fromNominatim(Map<String, dynamic> json) {
    return GeocodedLocation(
      latitude: double.tryParse(json['lat']?.toString() ?? '0') ?? 0,
      longitude: double.tryParse(json['lon']?.toString() ?? '0') ?? 0,
      displayName: json['display_name']?.toString() ?? '',
      address: json['address'] as String?,
    );
  }
}

class GeocodingService {
  GeocodingService({http.Client? client}) : _client = client ?? http.Client();

  final http.Client _client;

  /// Geocode an address string to coordinates using OpenStreetMap Nominatim.
  Future<GeocodedLocation> geocode(String address) async {
    final uri = Uri.parse(AppConfig.nominatimSearchUrl).replace(
      queryParameters: {
        'q': address,
        'format': 'json',
        'limit': '1',
        'addressdetails': '1',
      },
    );

    final response = await _client.get(
      uri,
      headers: {'Accept': 'application/json'},
    );

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw GeocodingException(
          'Geocoding request failed (${response.statusCode})');
    }

    final results = jsonDecode(response.body) as List<dynamic>;
    if (results.isEmpty) {
      throw GeocodingException('Address not found: $address');
    }

    return GeocodedLocation.fromNominatim(
        results.first as Map<String, dynamic>);
  }

  /// Reverse geocode coordinates to an address.
  Future<GeocodedLocation> reverseGeocode(
      double latitude, double longitude) async {
    final uri = Uri.parse(AppConfig.nominatimReverseUrl).replace(
      queryParameters: {
        'lat': latitude.toString(),
        'lon': longitude.toString(),
        'format': 'json',
        'addressdetails': '1',
      },
    );

    final response = await _client.get(
      uri,
      headers: {'Accept': 'application/json'},
    );

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw GeocodingException(
          'Reverse geocoding failed (${response.statusCode})');
    }

    final decoded = jsonDecode(response.body) as Map<String, dynamic>;
    return GeocodedLocation.fromNominatim(decoded);
  }

  /// Calculate distance in kilometers between two coordinates using Haversine.
  static double distanceKm(
      double lat1, double lon1, double lat2, double lon2) {
    const earthRadiusKm = 6371.0;

    final dLat = _toRadians(lat2 - lat1);
    final dLon = _toRadians(lon2 - lon1);

    final a = sin(dLat / 2) * sin(dLat / 2) +
        cos(_toRadians(lat1)) *
            cos(_toRadians(lat2)) *
            sin(dLon / 2) *
            sin(dLon / 2);

    final c = 2 * atan2(sqrt(a), sqrt(1 - a));
    return earthRadiusKm * c;
  }

  static double _toRadians(double degrees) => degrees * pi / 180;

  /// Filter a list of items with locations by max distance from a point.
  static List<T> filterByDistance<T>({
    required List<T> items,
    required double fromLat,
    required double fromLon,
    required double maxDistanceKm,
    required GeocodedLocation Function(T item) locationOf,
  }) {
    return items.where((item) {
      final loc = locationOf(item);
      final dist = distanceKm(fromLat, fromLon, loc.latitude, loc.longitude);
      return dist <= maxDistanceKm;
    }).toList();
  }
}

class GeocodingException implements Exception {
  const GeocodingException(this.message);

  final String message;

  @override
  String toString() => 'GeocodingException: $message';
}
