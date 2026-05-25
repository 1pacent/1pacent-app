import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../services/n8n_webhook_service.dart';

class TradieQuoteSubmitScreen extends StatefulWidget {
  const TradieQuoteSubmitScreen({required this.jobId, super.key});

  final String jobId;

  @override
  State<TradieQuoteSubmitScreen> createState() => _TradieQuoteSubmitScreenState();
}

class _TradieQuoteSubmitScreenState extends State<TradieQuoteSubmitScreen> {
  final N8nWebhookService _service = N8nWebhookService();
  final _formKey = GlobalKey<FormState>();
  final List<_LineItem> _lineItems = [_LineItem()];
  final Set<String> _selectedAvailability = {};
  final TextEditingController _assumptionsController = TextEditingController();
  bool _submitting = false;
  String? _error;
  String? _quoteReference;

  static const _slotLabels = {
    'morning': 'Morning',
    'afternoon': 'Afternoon',
    'evening': 'Evening',
  };

  List<String> get _next7DayLabels {
    final now = DateTime.now();
    final days = <String>[];
    for (int i = 0; i < 7; i++) {
      final d = now.add(Duration(days: i));
      final weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      final months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      days.add('${weekdays[d.weekday - 1]} ${d.day} ${months[d.month - 1]}');
    }
    return days;
  }

  double get _total {
    return _lineItems.fold(0.0, (sum, item) => sum + item.total);
  }

  void _addLineItem() {
    setState(() {
      _lineItems.add(_LineItem());
    });
  }

  void _removeLineItem(int index) {
    if (_lineItems.length <= 1) return;
    setState(() {
      _lineItems.removeAt(index);
    });
  }

  void _toggleSlot(int dayIndex, String period) {
    final label = '${_next7DayLabels[dayIndex]} • ${_slotLabels[period]}';
    setState(() {
      if (_selectedAvailability.contains(label)) {
        _selectedAvailability.remove(label);
      } else {
        _selectedAvailability.add(label);
      }
    });
  }

  bool _isSlotSelected(int dayIndex, String period) {
    final label = '${_next7DayLabels[dayIndex]} • ${_slotLabels[period]}';
    return _selectedAvailability.contains(label);
  }

  Future<void> _submitQuote() async {
    if (!_formKey.currentState!.validate()) return;
    if (_lineItems.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Add at least one line item.')),
      );
      return;
    }

    setState(() {
      _submitting = true;
      _error = null;
    });

    try {
      final result = await _service.submitQuote(
        jobId: widget.jobId,
        lineItems: _lineItems.map((i) => i.toJson()).toList(),
        total: _total,
        availability: _selectedAvailability.toList(),
        assumptions: _assumptionsController.text.trim(),
      );
      setState(() {
        _submitting = false;
        _quoteReference = result['quote_id']?.toString() ?? result['reference']?.toString() ?? 'Q-${DateTime.now().millisecondsSinceEpoch}';
      });
    } catch (e) {
      setState(() {
        _submitting = false;
        _error = e.toString();
      });
    }
  }

  @override
  void dispose() {
    _assumptionsController.dispose();
    for (final item in _lineItems) {
      item.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Submit quote')),
      body: _quoteReference != null ? _buildSuccess() : _buildForm(),
    );
  }

  Widget _buildSuccess() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.check_circle_outline,
                size: 64, color: Theme.of(context).colorScheme.primary),
            const SizedBox(height: 16),
            Text('Quote submitted!',
                style: Theme.of(context).textTheme.headlineSmall),
            const SizedBox(height: 8),
            Text('Reference: $_quoteReference',
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    color: Theme.of(context).colorScheme.primary)),
            const SizedBox(height: 4),
            Text('for Job #${widget.jobId}',
                style: Theme.of(context).textTheme.bodyMedium),
            const SizedBox(height: 8),
            Text('Total: \$${_total.toStringAsFixed(2)}',
                style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 24),
            FilledButton.icon(
              onPressed: () => context.go('/tradie/jobs'),
              icon: const Icon(Icons.arrow_back),
              label: const Text('Back to jobs'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildForm() {
    return Column(
      children: [
        if (_error != null)
          Padding(
            padding: const EdgeInsets.all(16),
            child: Card(
              color: Theme.of(context).colorScheme.errorContainer,
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Row(
                  children: [
                    Icon(Icons.error_outline,
                        color: Theme.of(context).colorScheme.error),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(_error!,
                          style: TextStyle(
                              color: Theme.of(context).colorScheme.error)),
                    ),
                  ],
                ),
              ),
            ),
          ),
        Expanded(
          child: Form(
            key: _formKey,
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Text('Line items',
                    style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: 8),
                ...List.generate(_lineItems.length, (index) {
                  final item = _lineItems[index];
                  return Card(
                    margin: const EdgeInsets.only(bottom: 8),
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Column(
                        children: [
                          Row(
                            children: [
                              Text('Item ${index + 1}',
                                  style: Theme.of(context).textTheme.titleSmall),
                              const Spacer(),
                              if (_lineItems.length > 1)
                                IconButton(
                                  icon: const Icon(Icons.close, size: 20),
                                  onPressed: () => _removeLineItem(index),
                                ),
                            ],
                          ),
                          TextFormField(
                            controller: item.descriptionController,
                            decoration: const InputDecoration(
                              labelText: 'Description',
                              border: OutlineInputBorder(),
                            ),
                            validator: (v) =>
                                (v == null || v.trim().isEmpty) ? 'Required' : null,
                          ),
                          const SizedBox(height: 8),
                          Row(
                            children: [
                              Expanded(
                                child: TextFormField(
                                  controller: item.qtyController,
                                  decoration: const InputDecoration(
                                    labelText: 'Qty',
                                    border: OutlineInputBorder(),
                                  ),
                                  keyboardType: TextInputType.number,
                                  validator: (v) {
                                    if (v == null || v.trim().isEmpty) return 'Required';
                                    if (double.tryParse(v.trim()) == null) return 'Invalid';
                                    return null;
                                  },
                                ),
                              ),
                              const SizedBox(width: 8),
                              Expanded(
                                child: TextFormField(
                                  controller: item.rateController,
                                  decoration: const InputDecoration(
                                    labelText: 'Rate (\$)',
                                    border: OutlineInputBorder(),
                                  ),
                                  keyboardType: TextInputType.number,
                                  validator: (v) {
                                    if (v == null || v.trim().isEmpty) return 'Required';
                                    if (double.tryParse(v.trim()) == null) return 'Invalid';
                                    return null;
                                  },
                                ),
                              ),
                              const SizedBox(width: 8),
                              SizedBox(
                                width: 80,
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text('Total',
                                        style: Theme.of(context).textTheme.labelSmall),
                                    Text('\$${item.total.toStringAsFixed(2)}',
                                        style: Theme.of(context).textTheme.titleSmall?.copyWith(
                                            fontWeight: FontWeight.w600)),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  );
                }),
                OutlinedButton.icon(
                  onPressed: _addLineItem,
                  icon: const Icon(Icons.add),
                  label: const Text('Add line item'),
                ),
                const SizedBox(height: 16),
                Card(
                  color: Theme.of(context).colorScheme.primaryContainer,
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text('Total quote',
                            style: Theme.of(context).textTheme.titleMedium),
                        Text('\$${_total.toStringAsFixed(2)}',
                            style: Theme.of(context).textTheme.titleLarge?.copyWith(
                                fontWeight: FontWeight.bold)),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 24),
                Text('Your availability',
                    style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: 8),
                Text('Select when you can attend (next 7 days)',
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: Theme.of(context).colorScheme.onSurfaceVariant)),
                const SizedBox(height: 8),
                ...List.generate(_next7DayLabels.length, (dayIdx) {
                  final dayLabel = _next7DayLabels[dayIdx];
                  return Card(
                    margin: const EdgeInsets.only(bottom: 4),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 4, horizontal: 8),
                      child: Row(
                        children: [
                          Expanded(
                            flex: 2,
                            child: Text(dayLabel,
                                style: Theme.of(context).textTheme.bodyMedium),
                          ),
                          for (final period in ['morning', 'afternoon', 'evening'])
                            Expanded(
                              child: FilterChip(
                                label: Text(_slotLabels[period]!.substring(0, 3),
                                    style: const TextStyle(fontSize: 12)),
                                selected: _isSlotSelected(dayIdx, period),
                                onSelected: (_) => _toggleSlot(dayIdx, period),
                                materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                              ),
                            ),
                        ],
                      ),
                    ),
                  );
                }),
                const SizedBox(height: 16),
                Text('Assumptions & notes',
                    style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: 8),
                TextFormField(
                  controller: _assumptionsController,
                  decoration: const InputDecoration(
                    labelText: 'Assumptions (optional)',
                    hintText: 'e.g. Materials not included. Access via front door.',
                    border: OutlineInputBorder(),
                  ),
                  maxLines: 3,
                ),
              ],
            ),
          ),
        ),
        SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: FilledButton.icon(
              onPressed: _submitting ? null : _submitQuote,
              icon: _submitting
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.send),
              label: Text(_submitting ? 'Submitting...' : 'Submit quote'),
            ),
          ),
        ),
      ],
    );
  }
}

class _LineItem {
  final TextEditingController descriptionController = TextEditingController();
  final TextEditingController qtyController = TextEditingController(text: '1');
  final TextEditingController rateController = TextEditingController();

  double get qty => double.tryParse(qtyController.text.trim()) ?? 0;
  double get rate => double.tryParse(rateController.text.trim()) ?? 0;
  double get total => qty * rate;

  Map<String, dynamic> toJson() => {
        'description': descriptionController.text.trim(),
        'quantity': qty,
        'rate': rate,
        'total': total,
      };

  void dispose() {
    descriptionController.dispose();
    qtyController.dispose();
    rateController.dispose();
  }
}
