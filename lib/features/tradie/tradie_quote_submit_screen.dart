import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../models/tradie_quote_submission.dart';
import '../../services/n8n_webhook_service.dart';

class TradieQuoteSubmitScreen extends StatefulWidget {
  const TradieQuoteSubmitScreen({required this.jobId, super.key});

  final String jobId;

  @override
  State<TradieQuoteSubmitScreen> createState() =>
      _TradieQuoteSubmitScreenState();
}

class _TradieQuoteSubmitScreenState extends State<TradieQuoteSubmitScreen> {
  final _formKey = GlobalKey<FormState>();
  final _service = N8nWebhookService();
  final _tradieIdController = TextEditingController(text: 'TRADIE-DEMO-001');
  final _companyIdController = TextEditingController(text: 'COMPANY-DEMO-001');
  final _tradieNameController = TextEditingController(text: 'Demo Electrician');
  final _scheduledStartController = TextEditingController();
  final _scheduledEndController = TextEditingController();
  final _assumptionsController = TextEditingController();
  final _lineItems = <_LineItemController>[];

  bool _submitting = false;
  Map<String, dynamic>? _result;
  String? _error;

  @override
  void initState() {
    super.initState();
    final tomorrow = DateTime.now().add(const Duration(days: 1));
    final start = DateTime(tomorrow.year, tomorrow.month, tomorrow.day, 9);
    final end = start.add(const Duration(hours: 2));
    _scheduledStartController.text = start.toIso8601String();
    _scheduledEndController.text = end.toIso8601String();
    _lineItems.add(_createLineItem());
  }

  @override
  void dispose() {
    _tradieIdController.dispose();
    _companyIdController.dispose();
    _tradieNameController.dispose();
    _scheduledStartController.dispose();
    _scheduledEndController.dispose();
    _assumptionsController.dispose();
    for (final lineItem in _lineItems) {
      lineItem.dispose();
    }
    super.dispose();
  }

  double get _total =>
      _lineItems.fold(0, (sum, lineItem) => sum + lineItem.total);

  void _addLineItem() {
    setState(() => _lineItems.add(_createLineItem()));
  }

  void _removeLineItem(int index) {
    if (_lineItems.length == 1) return;
    setState(() => _lineItems.removeAt(index).dispose());
  }

  _LineItemController _createLineItem() {
    final lineItem = _LineItemController();
    lineItem.quantityController.addListener(_refreshTotal);
    lineItem.rateController.addListener(_refreshTotal);
    return lineItem;
  }

  void _refreshTotal() {
    if (mounted) setState(() {});
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() {
      _submitting = true;
      _error = null;
      _result = null;
    });

    final submission = TradieQuoteSubmission(
      workOrderId: widget.jobId,
      tradieId: _tradieIdController.text.trim(),
      companyId: _companyIdController.text.trim(),
      tradieName: _tradieNameController.text.trim(),
      scheduledStart: _scheduledStartController.text.trim(),
      scheduledEnd: _scheduledEndController.text.trim(),
      assumptions: _assumptionsController.text.trim(),
      lineItems: _lineItems
          .map((lineItem) => TradieQuoteLineItem(
                description: lineItem.description.text.trim(),
                quantity: lineItem.quantity,
                rate: lineItem.rate,
              ))
          .toList(),
    );

    try {
      final result = await _service.submitTradieQuote(submission);
      if (!mounted) return;
      setState(() => _result = result);
    } catch (error) {
      if (!mounted) return;
      setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Submit quote')),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text('Job ${widget.jobId}',
                style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 6),
            Text(
              'This sends your price and proposed window to n8n. n8n/Postgres handle scoring, approvals, scheduling and notifications.',
              style: Theme.of(context).textTheme.bodyMedium,
            ),
            const SizedBox(height: 16),
            _SectionCard(
              title: 'Tradie',
              icon: Icons.engineering_outlined,
              children: [
                _RequiredTextField(
                  controller: _tradieIdController,
                  label: 'Tradie ID',
                ),
                _RequiredTextField(
                  controller: _companyIdController,
                  label: 'Company ID',
                ),
                _RequiredTextField(
                  controller: _tradieNameController,
                  label: 'Display name',
                ),
              ],
            ),
            _SectionCard(
              title: 'Proposed window',
              icon: Icons.schedule_outlined,
              children: [
                _RequiredTextField(
                  controller: _scheduledStartController,
                  label: 'Start ISO time',
                ),
                _RequiredTextField(
                  controller: _scheduledEndController,
                  label: 'End ISO time',
                ),
              ],
            ),
            _SectionCard(
              title: 'Line items',
              icon: Icons.receipt_long_outlined,
              children: [
                for (var i = 0; i < _lineItems.length; i++) ...[
                  _LineItemFields(
                    index: i,
                    item: _lineItems[i],
                    onRemove: _lineItems.length == 1
                        ? null
                        : () => _removeLineItem(i),
                  ),
                  if (i != _lineItems.length - 1) const Divider(height: 24),
                ],
                OutlinedButton.icon(
                  onPressed: _addLineItem,
                  icon: const Icon(Icons.add),
                  label: const Text('Add item'),
                ),
              ],
            ),
            _SectionCard(
              title: 'Notes',
              icon: Icons.notes_outlined,
              children: [
                TextFormField(
                  controller: _assumptionsController,
                  decoration: const InputDecoration(
                    border: OutlineInputBorder(),
                    labelText: 'Assumptions',
                  ),
                  maxLines: 3,
                ),
              ],
            ),
            Card(
              color: const Color(0xFFEAF6EF),
              child: ListTile(
                title: const Text('Total quote'),
                trailing: Text(
                  '\$${_total.toStringAsFixed(2)}',
                  style: Theme.of(context).textTheme.titleLarge,
                ),
              ),
            ),
            const SizedBox(height: 12),
            FilledButton.icon(
              onPressed: _submitting || widget.jobId.isEmpty ? null : _submit,
              icon: _submitting
                  ? const SizedBox.square(
                      dimension: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.send_outlined),
              label: Text(_submitting ? 'Submitting' : 'Submit to n8n'),
            ),
            if (_error != null) ...[
              const SizedBox(height: 12),
              _ResultPanel(
                title: 'Could not submit quote',
                body: _error!,
                isError: true,
              ),
            ],
            if (_result != null) ...[
              const SizedBox(height: 12),
              _ResultPanel(
                title: 'Quote sent',
                body: _successMessage(_result!),
              ),
              const SizedBox(height: 8),
              OutlinedButton.icon(
                onPressed: () => context.go('/job/${widget.jobId}/quotes'),
                icon: const Icon(Icons.request_quote_outlined),
                label: const Text('View quote options'),
              ),
            ],
          ],
        ),
      ),
    );
  }

  String _successMessage(Map<String, dynamic> result) {
    final optionsCount = result['options_count']?.toString();
    final approvalId = result['approval_id']?.toString();
    final nextAction = result['next_action']?.toString();
    return [
      if (optionsCount != null) 'Options saved: $optionsCount',
      if (approvalId != null) 'Approval: $approvalId',
      if (nextAction != null) 'Next: $nextAction',
      if (optionsCount == null && approvalId == null && nextAction == null)
        'n8n accepted the quote submission.',
    ].join('\n');
  }
}

class _LineItemController {
  final description = TextEditingController();
  final quantityController = TextEditingController(text: '1');
  final rateController = TextEditingController();

  double get quantity => double.tryParse(quantityController.text.trim()) ?? 0;
  double get rate => double.tryParse(rateController.text.trim()) ?? 0;
  double get total => quantity * rate;

  void dispose() {
    description.dispose();
    quantityController.dispose();
    rateController.dispose();
  }
}

class _LineItemFields extends StatelessWidget {
  const _LineItemFields({
    required this.index,
    required this.item,
    required this.onRemove,
  });

  final int index;
  final _LineItemController item;
  final VoidCallback? onRemove;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Row(
          children: [
            Expanded(child: Text('Item ${index + 1}')),
            if (onRemove != null)
              IconButton(
                onPressed: onRemove,
                icon: const Icon(Icons.close),
                tooltip: 'Remove item',
              ),
          ],
        ),
        _RequiredTextField(
          controller: item.description,
          label: 'Description',
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(
              child: _NumberTextField(
                controller: item.quantityController,
                label: 'Qty',
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: _NumberTextField(
                controller: item.rateController,
                label: 'Rate',
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _SectionCard extends StatelessWidget {
  const _SectionCard({
    required this.title,
    required this.icon,
    required this.children,
  });

  final String title;
  final IconData icon;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final spaced = <Widget>[];
    for (final child in children) {
      if (spaced.isNotEmpty) spaced.add(const SizedBox(height: 10));
      spaced.add(child);
    }

    return Card(
      margin: const EdgeInsets.only(bottom: 14),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(icon),
                const SizedBox(width: 8),
                Text(title, style: Theme.of(context).textTheme.titleMedium),
              ],
            ),
            const SizedBox(height: 12),
            ...spaced,
          ],
        ),
      ),
    );
  }
}

class _RequiredTextField extends StatelessWidget {
  const _RequiredTextField({
    required this.controller,
    required this.label,
  });

  final TextEditingController controller;
  final String label;

  @override
  Widget build(BuildContext context) {
    return TextFormField(
      controller: controller,
      decoration: InputDecoration(
        border: const OutlineInputBorder(),
        labelText: label,
      ),
      validator: (value) =>
          value == null || value.trim().isEmpty ? 'Required' : null,
    );
  }
}

class _NumberTextField extends StatelessWidget {
  const _NumberTextField({
    required this.controller,
    required this.label,
  });

  final TextEditingController controller;
  final String label;

  @override
  Widget build(BuildContext context) {
    return TextFormField(
      controller: controller,
      decoration: InputDecoration(
        border: const OutlineInputBorder(),
        labelText: label,
      ),
      keyboardType: TextInputType.number,
      validator: (value) {
        if (value == null || value.trim().isEmpty) return 'Required';
        if (double.tryParse(value.trim()) == null) return 'Invalid number';
        return null;
      },
    );
  }
}

class _ResultPanel extends StatelessWidget {
  const _ResultPanel({
    required this.title,
    required this.body,
    this.isError = false,
  });

  final String title;
  final String body;
  final bool isError;

  @override
  Widget build(BuildContext context) {
    return Card(
      color: isError ? const Color(0xFFFFF1ED) : const Color(0xFFEAF6EF),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 6),
            Text(body),
          ],
        ),
      ),
    );
  }
}
