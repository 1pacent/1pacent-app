class TradieQuoteLineItem {
  const TradieQuoteLineItem({
    required this.description,
    required this.quantity,
    required this.rate,
  });

  final String description;
  final double quantity;
  final double rate;

  double get total => quantity * rate;

  Map<String, dynamic> toJson() {
    return {
      'description': description,
      'quantity': quantity,
      'rate': rate,
      'total': total,
    };
  }
}

class TradieQuoteSubmission {
  const TradieQuoteSubmission({
    required this.workOrderId,
    required this.tradieId,
    required this.companyId,
    required this.tradieName,
    required this.scheduledStart,
    required this.scheduledEnd,
    required this.lineItems,
    this.assumptions,
  });

  final String workOrderId;
  final String tradieId;
  final String companyId;
  final String tradieName;
  final String scheduledStart;
  final String scheduledEnd;
  final List<TradieQuoteLineItem> lineItems;
  final String? assumptions;

  double get total =>
      lineItems.fold(0, (sum, lineItem) => sum + lineItem.total);

  Map<String, dynamic> toJson() {
    return {
      'work_order_id': workOrderId,
      'max_options': 3,
      'tradie_options': [
        {
          'tradie_id': tradieId,
          'company_id': companyId,
          'tradie_name': tradieName,
          'amount': total,
          'scheduled_start': scheduledStart,
          'scheduled_end': scheduledEnd,
          'source': 'tradie_app_quote_submission',
          'line_items': lineItems.map((lineItem) => lineItem.toJson()).toList(),
          if (assumptions != null && assumptions!.trim().isNotEmpty)
            'assumptions': assumptions!.trim(),
        },
      ],
    };
  }
}
