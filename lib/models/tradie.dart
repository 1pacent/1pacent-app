class Tradie {
  const Tradie({
    required this.id,
    required this.displayName,
    required this.tradeTypes,
    this.trustScore,
  });

  final String id;
  final String displayName;
  final List<String> tradeTypes;
  final double? trustScore;
}
