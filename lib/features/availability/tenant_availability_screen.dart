import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../models/availability_slot.dart';
import '../../services/n8n_webhook_service.dart';

class TenantAvailabilityScreen extends StatefulWidget {
  const TenantAvailabilityScreen({required this.jobId, super.key});

  final String jobId;

  @override
  State<TenantAvailabilityScreen> createState() => _TenantAvailabilityScreenState();
}

class _TenantAvailabilityScreenState extends State<TenantAvailabilityScreen> {
  final N8nWebhookService _service = N8nWebhookService();
  final Set<AvailabilitySlot> _selectedSlots = {};
  bool _submitting = false;
  bool _submitted = false;
  String? _error;

  static const _periods = ['morning', 'afternoon', 'evening'];
  static const _periodLabels = ['Morning (8am–12pm)', 'Afternoon (12pm–5pm)', 'Evening (5pm–8pm)'];
  static const _periodIcons = [Icons.wb_sunny_outlined, Icons.wb_cloudy_outlined, Icons.nights_stay_outlined];

  List<DateTime> get _next14Days {
    final now = DateTime.now();
    return List.generate(14, (i) => DateTime(now.year, now.month, now.day + i));
  }

  bool _isSelected(DateTime date, String period) {
    return _selectedSlots.any((s) =>
        s.date.year == date.year &&
        s.date.month == date.month &&
        s.date.day == date.day &&
        s.period == period);
  }

  void _toggleSlot(DateTime date, String period) {
    final slot = AvailabilitySlot(date: date, period: period);
    setState(() {
      final existing = _selectedSlots.where((s) =>
          s.date.year == date.year &&
          s.date.month == date.month &&
          s.date.day == date.day &&
          s.period == period);
      if (existing.isNotEmpty) {
        _selectedSlots.remove(existing.first);
      } else {
        _selectedSlots.add(slot);
      }
    });
  }

  Future<void> _confirmAvailability() async {
    if (_selectedSlots.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please select at least one time slot.')),
      );
      return;
    }

    setState(() {
      _submitting = true;
      _error = null;
    });

    try {
      await _service.updateAvailability(
        jobId: widget.jobId,
        slots: _selectedSlots.map((s) => s.toJson()).toList(),
      );
      setState(() {
        _submitting = false;
        _submitted = true;
      });
    } catch (e) {
      setState(() {
        _submitting = false;
        _error = e.toString();
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Your availability'),
        actions: [
          IconButton(
            icon: const Icon(Icons.check),
            onPressed: _submitting || _submitted ? null : _confirmAvailability,
            tooltip: 'Confirm availability',
          ),
        ],
      ),
      body: _submitted ? _buildConfirmation() : _buildSelector(),
    );
  }

  Widget _buildConfirmation() {
    final sorted = _selectedSlots.toList()
      ..sort((a, b) {
        final dateCmp = a.date.compareTo(b.date);
        if (dateCmp != 0) return dateCmp;
        return _periods.indexOf(a.period).compareTo(_periods.indexOf(b.period));
      });

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Card(
          color: Theme.of(context).colorScheme.primaryContainer,
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              children: [
                Icon(Icons.check_circle_outline,
                    size: 48, color: Theme.of(context).colorScheme.primary),
                const SizedBox(height: 12),
                Text('Availability confirmed',
                    style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: 4),
                Text(
                  '${sorted.length} time slot${sorted.length == 1 ? '' : 's'} saved for Job #${widget.jobId}',
                  style: Theme.of(context).textTheme.bodyMedium,
                  textAlign: TextAlign.center,
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 16),
        Text('Confirmed slots', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 8),
        ...sorted.map((slot) => Card(
              child: ListTile(
                leading: Icon(
                  slot.period == 'morning'
                      ? Icons.wb_sunny_outlined
                      : slot.period == 'afternoon'
                          ? Icons.wb_cloudy_outlined
                          : Icons.nights_stay_outlined,
                ),
                title: Text(slot.label),
              ),
            )),
      ],
    );
  }

  Widget _buildSelector() {
    final days = _next14Days;

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
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
          child: Text(
            'Select when you\'re available for Job #${widget.jobId}',
            style: Theme.of(context).textTheme.titleMedium,
          ),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Text(
            'Pick dates and time slots that work for you. The tradie will use this to schedule.',
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: Theme.of(context).colorScheme.onSurfaceVariant),
          ),
        ),
        const SizedBox(height: 8),
        Expanded(
          child: ListView.builder(
            itemCount: days.length,
            itemBuilder: (context, index) {
              final date = days[index];
              final isWeekend = date.weekday == DateTime.saturday ||
                  date.weekday == DateTime.sunday;
              final dayLabel = DateFormat('EEEE, d MMM').format(date);
              return Card(
                margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                        child: Row(
                          children: [
                            Text(dayLabel,
                                style: Theme.of(context).textTheme.titleSmall?.copyWith(
                                    fontWeight: FontWeight.w600,
                                    color: isWeekend
                                        ? Theme.of(context).colorScheme.primary
                                        : null)),
                            if (isWeekend) ...[
                              const SizedBox(width: 8),
                              Container(
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 6, vertical: 2),
                                decoration: BoxDecoration(
                                  color: Theme.of(context).colorScheme.primaryContainer,
                                  borderRadius: BorderRadius.circular(4),
                                ),
                                child: Text('Weekend',
                                    style: Theme.of(context).textTheme.labelSmall),
                              ),
                            ],
                          ],
                        ),
                      ),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                        children: List.generate(3, (pi) {
                          final period = _periods[pi];
                          final selected = _isSelected(date, period);
                          return Expanded(
                            child: Padding(
                              padding: const EdgeInsets.symmetric(horizontal: 2),
                              child: FilterChip(
                                selected: selected,
                                onSelected: (_) => _toggleSlot(date, period),
                                avatar: Icon(_periodIcons[pi], size: 18),
                                label: Text(_periodLabels[pi].split(' ')[0]),
                              ),
                            ),
                          );
                        }),
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
        SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: FilledButton.icon(
              onPressed: _submitting ? null : _confirmAvailability,
              icon: _submitting
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.check),
              label: Text(_submitting ? 'Saving...' : 'Confirm ${_selectedSlots.length} slot(s)'),
            ),
          ),
        ),
      ],
    );
  }
}
