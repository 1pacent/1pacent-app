class Property {
  const Property({
    required this.id,
    required this.address,
    required this.landlordId,
    this.tenantIds = const [],
    this.propertyType,
    this.bedrooms,
    this.bathrooms,
    this.latitude,
    this.longitude,
    this.suburb,
    this.state,
    this.postcode,
  });

  final String id;
  final String address;
  final String landlordId;
  final List<String> tenantIds;
  final String? propertyType;
  final int? bedrooms;
  final int? bathrooms;
  final double? latitude;
  final double? longitude;
  final String? suburb;
  final String? state;
  final String? postcode;

  factory Property.fromJson(Map<String, dynamic> json) {
    final addressObj = json['address'] as Map<String, dynamic>?;
    final street = json['street']?.toString() ?? addressObj?['street']?.toString() ?? '';
    final suburb = json['suburb']?.toString() ?? addressObj?['suburb']?.toString() ?? '';
    final state = json['state']?.toString() ?? addressObj?['state']?.toString() ?? '';
    final postcode = json['postcode']?.toString() ?? addressObj?['postcode']?.toString() ?? '';

    final fullAddressParts = <String>[];
    if (street.isNotEmpty) fullAddressParts.add(street);
    if (suburb.isNotEmpty) fullAddressParts.add(suburb);
    if (state.isNotEmpty) fullAddressParts.add(state);
    if (postcode.isNotEmpty) fullAddressParts.add(postcode);

    return Property(
      id: json['id']?.toString() ?? json['property_id']?.toString() ?? '',
      address: json['full_address']?.toString() ??
          fullAddressParts.join(', '),
      landlordId: json['landlord_id']?.toString() ?? '',
      tenantIds: (json['tenant_ids'] as List<dynamic>?)
              ?.map((e) => e.toString())
              .toList() ??
          const [],
      propertyType: json['property_type']?.toString() ??
          json['type']?.toString(),
      bedrooms: (json['bedrooms'] as num?)?.toInt(),
      bathrooms: (json['bathrooms'] as num?)?.toInt(),
      latitude: (json['latitude'] as num?)?.toDouble() ??
          (json['lat'] as num?)?.toDouble(),
      longitude: (json['longitude'] as num?)?.toDouble() ??
          (json['lon'] as num?)?.toDouble(),
      suburb: suburb.isNotEmpty ? suburb : null,
      state: state.isNotEmpty ? state : null,
      postcode: postcode.isNotEmpty ? postcode : null,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'address': address,
      'landlord_id': landlordId,
      'tenant_ids': tenantIds,
      if (propertyType != null) 'property_type': propertyType,
      if (bedrooms != null) 'bedrooms': bedrooms,
      if (bathrooms != null) 'bathrooms': bathrooms,
      if (latitude != null) 'latitude': latitude,
      if (longitude != null) 'longitude': longitude,
      if (suburb != null) 'suburb': suburb,
      if (state != null) 'state': state,
      if (postcode != null) 'postcode': postcode,
    };
  }

  bool get hasCoordinates => latitude != null && longitude != null;

  String get displayAddress {
    final parts = <String>[address];
    if (suburb != null && address.contains(suburb!) == false) {
      parts.add(suburb!);
    }
    return parts.join(', ');
  }
}
