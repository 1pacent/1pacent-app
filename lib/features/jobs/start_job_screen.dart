import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/session/app_session.dart';
import '../../models/quote.dart';
import '../../models/work_order_request.dart';
import '../../services/n8n_webhook_service.dart';

enum _IntakeStage { triage, availability, options, booking, active }

class StartJobScreen extends StatefulWidget {
  const StartJobScreen({super.key});

  @override
  State<StartJobScreen> createState() => _StartJobScreenState();
}

class _StartJobScreenState extends State<StartJobScreen> {
  final _service = N8nWebhookService();
  final _descriptionController = TextEditingController(
    text: 'Intermittent power issue after a prior repair.',
  );
  final _addressController = TextEditingController(text: '10 UAT Street');
  final _suburbController = TextEditingController(text: 'Richmond');

  _IntakeStage _stage = _IntakeStage.triage;
  String _tradeType = 'electrical';
  String _jobType = 'fault_finding';
  String _urgency = 'normal';
  String _propertyScenario = 'rental';
  String? _selectedAvailability;
  bool _busy = false;
  String? _error;
  Map<String, dynamic>? _intakeResult;
  List<Quote> _quotes = const [];
  String? _approvalId;
  Quote? _selectedQuote;
  Map<String, dynamic>? _bookingResult;

  @override
  void initState() {
    super.initState();
    final user = appSession.user;
    _propertyScenario = user?.propertyScenario ??
        (user?.persona == UserPersona.tenant ? 'rental' : 'owner_occupied');
    if (_propertyScenario == 'owner_occupied') {
      _tradeType = 'plumbing';
      _jobType = 'leak_repair';
      _descriptionController.text = 'Leaking tap in the kitchen.';
      _addressController.text = '20 UAT Owner Street';
    }
  }

  @override
  void dispose() {
    _descriptionController.dispose();
    _addressController.dispose();
    _suburbController.dispose();
    super.dispose();
  }

  bool get _isRental => _propertyScenario == 'rental';

  bool get _canApproveInApp {
    final persona = appSession.user?.persona;
    return persona == UserPersona.ownerOccupier ||
        persona == UserPersona.landlord;
  }

  List<String> get _availabilityOptions {
    if (_isRental) {
      return const [
        'Thu 4 Jun, 9:00 am to 12:00 pm - tenant available',
        'Fri 5 Jun, 2:00 pm to 4:00 pm - tenant backup',
        'Mon 8 Jun, 10:00 am to 12:00 pm - access by appointment',
      ];
    }
    return const [
      'Mon 8 Jun, 10:00 am to 12:00 pm - owner available',
      'Tue 9 Jun, 1:00 pm to 4:00 pm - owner backup',
      'Wed 10 Jun, 9:00 am to 11:00 am - key safe access',
    ];
  }

  Future<void> _runIntake() async {
    if (_descriptionController.text.trim().isEmpty ||
        _addressController.text.trim().isEmpty) {
      setState(() => _error = 'Add the issue and address first.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
      _intakeResult = null;
      _quotes = const [];
      _approvalId = null;
      _selectedQuote = null;
      _bookingResult = null;
    });

    try {
      final response = await _service.createWorkOrder(_request().toJson());
      if (!mounted) return;
      setState(() {
        _intakeResult = response;
        _stage = _IntakeStage.options;
      });
      await _fetchOptions(response['work_order_id']?.toString());
    } catch (error) {
      if (!mounted) return;
      setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _fetchOptions(String? workOrderId) async {
    if (workOrderId == null || workOrderId.isEmpty) return;
    setState(() => _busy = true);
    try {
      final response = await _service.fetchQuoteOptions(workOrderId);
      final optionData = response['options'] as List<dynamic>? ?? const [];
      final quotes = optionData
          .whereType<Map<String, dynamic>>()
          .map(Quote.fromJson)
          .toList();
      if (!mounted) return;
      setState(() {
        _approvalId = response['approval_id']?.toString();
        _quotes = quotes;
        if (quotes.isNotEmpty) _selectedQuote = quotes.first;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _approveSelectedQuote() async {
    final quote = _selectedQuote;
    final approvalId = _approvalId;
    if (quote == null || approvalId == null || approvalId.isEmpty) {
      setState(() => _error = 'Pick a quote option first.');
      return;
    }

    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final response = await _service.approveQuoteOption(
        approvalId: approvalId,
        optionId: quote.id,
      );
      if (!mounted) return;
      setState(() {
        _bookingResult = response;
        _stage = _IntakeStage.active;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  WorkOrderRequest _request() {
    final user = appSession.user;
    final requesterRole = _requesterRole(user);
    final availability = [
      if (_selectedAvailability != null) _selectedAvailability!,
      ..._availabilityOptions
          .where((item) => item != _selectedAvailability)
          .take(1),
    ];

    return WorkOrderRequest(
      customerName: user?.name ?? 'UAT Customer',
      phone: user?.persona == UserPersona.ownerOccupier
          ? '0400000002'
          : '0400000001',
      email: user?.email ?? 'uat.customer@1pacent.com',
      address: _addressController.text.trim(),
      suburb: _suburbController.text.trim(),
      tradeType: _tradeType,
      jobType: _jobType,
      description: _descriptionController.text.trim(),
      urgency: _urgency,
      propertyScenario: _propertyScenario,
      requesterRole: requesterRole,
      approvalRecipientRole: _isRental ? 'landlord' : 'owner',
      requesterAvailability: availability,
      consentToContact: true,
      consentToStore: true,
      estimatedAmount: _estimateAmount(),
      agencyId: 'AGENCY-UAT-001',
      propertyManagerId: 'PM-UAT-001',
      landlordId: _isRental ? 'LL-UAT-001' : 'LL-UAT-OWNER-001',
      tenantId: _isRental ? 'TEN-UAT-001' : 'OWNER-UAT-001',
      propertyId: user?.propertyId ??
          (_isRental ? 'PROP-UAT-001' : 'PROP-UAT-OWNER-001'),
    );
  }

  String _requesterRole(AppUser? user) {
    if (_isRental) {
      return user?.persona == UserPersona.landlord ? 'landlord' : 'tenant';
    }
    return 'owner';
  }

  double _estimateAmount() {
    switch (_jobType) {
      case 'leak_repair':
        return 240;
      case 'safety_check':
        return 220;
      case 'power_point_install':
        return 420;
      case 'fault_finding':
        return 360;
      default:
        return 300;
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = appSession.user;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Book maintenance'),
        actions: [
          IconButton(
            tooltip: 'Track current job',
            icon: const Icon(Icons.route_outlined),
            onPressed: _intakeResult == null
                ? null
                : () => context.go('/job/${_intakeResult!['work_order_id']}'),
          ),
        ],
      ),
      body: SafeArea(
        child: Column(
          children: [
            _ProgressMap(
              stage: _stage,
              title: _heroTitle(user),
              subtitle: _heroSubtitle,
            ),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  _PersonaBanner(user: user),
                  const SizedBox(height: 12),
                  _StepSwitch(
                    stage: _stage,
                    triage: _triageCard(),
                    availability: _availabilityCard(),
                    options: _optionsCard(),
                    booking: _bookingCard(),
                    active: _activeCard(),
                  ),
                  if (_error != null) ...[
                    const SizedBox(height: 12),
                    _NoticeCard(
                      icon: Icons.error_outline,
                      title: 'Something needs attention',
                      body: _error!,
                      tone: _NoticeTone.warning,
                    ),
                  ],
                ],
              ),
            ),
            _BottomActionBar(
              busy: _busy,
              label: _buttonLabel,
              icon: _buttonIcon,
              enabled: _buttonEnabled,
              onPressed: _onPrimaryAction,
            ),
          ],
        ),
      ),
    );
  }

  String _heroTitle(AppUser? user) {
    if (_stage == _IntakeStage.active) return 'Job booked';
    if (_stage == _IntakeStage.options) {
      return _canApproveInApp ? 'Choose your option' : 'Options ready';
    }
    return user?.persona == UserPersona.tenant
        ? 'Report a rental issue'
        : 'Request a tradie';
  }

  String get _heroSubtitle {
    switch (_stage) {
      case _IntakeStage.triage:
        return 'Sally checks the issue, warranty, urgency and property path.';
      case _IntakeStage.availability:
        return 'Pick windows that n8n will match against tradie availability.';
      case _IntakeStage.options:
        return 'n8n has returned quote options with availability and trust scores.';
      case _IntakeStage.booking:
        return 'Confirm the option so George can lock the appointment.';
      case _IntakeStage.active:
        return 'The work order is active and ready for tracking.';
    }
  }

  String get _buttonLabel {
    switch (_stage) {
      case _IntakeStage.triage:
        return 'Continue';
      case _IntakeStage.availability:
        return 'Match options';
      case _IntakeStage.options:
        return _canApproveInApp ? 'Request this tradie' : 'Track approval';
      case _IntakeStage.booking:
        return 'Confirm booking';
      case _IntakeStage.active:
        return 'Track job';
    }
  }

  IconData get _buttonIcon {
    switch (_stage) {
      case _IntakeStage.triage:
        return Icons.arrow_forward;
      case _IntakeStage.availability:
        return Icons.manage_search_outlined;
      case _IntakeStage.options:
        return _canApproveInApp
            ? Icons.check_circle_outline
            : Icons.route_outlined;
      case _IntakeStage.booking:
        return Icons.event_available_outlined;
      case _IntakeStage.active:
        return Icons.route_outlined;
    }
  }

  bool get _buttonEnabled {
    if (_busy) return false;
    if (_stage == _IntakeStage.availability) {
      return _selectedAvailability != null;
    }
    if (_stage == _IntakeStage.booking) return _selectedQuote != null;
    return true;
  }

  void _onPrimaryAction() {
    switch (_stage) {
      case _IntakeStage.triage:
        setState(() {
          _stage = _IntakeStage.availability;
          _error = null;
          _selectedAvailability ??= _availabilityOptions.first;
        });
        return;
      case _IntakeStage.availability:
        _runIntake();
        return;
      case _IntakeStage.options:
        if (_canApproveInApp) {
          setState(() => _stage = _IntakeStage.booking);
        } else {
          final workOrderId = _intakeResult?['work_order_id']?.toString();
          if (workOrderId != null) context.go('/job/$workOrderId');
        }
        return;
      case _IntakeStage.booking:
        _approveSelectedQuote();
        return;
      case _IntakeStage.active:
        final workOrderId = _bookingResult?['work_order_id']?.toString() ??
            _intakeResult?['work_order_id']?.toString();
        if (workOrderId != null) context.go('/job/$workOrderId');
        return;
    }
  }

  Widget _triageCard() {
    return _IntakeCard(
      title: 'What service is needed?',
      subtitle:
          'This is the app version of Sally triage. Voice will use the same payload once the ElevenLabs bridge is ready.',
      children: [
        _SegmentedChoice(
          label: 'Trade',
          value: _tradeType,
          options: const {
            'electrical': 'Electrical',
            'plumbing': 'Plumbing',
            'hvac': 'Heating',
            'general_maintenance': 'General',
          },
          onChanged: (value) => setState(() {
            _tradeType = value;
            if (value == 'plumbing') _jobType = 'leak_repair';
            if (value == 'electrical') _jobType = 'fault_finding';
          }),
        ),
        const SizedBox(height: 12),
        _SegmentedChoice(
          label: 'Issue type',
          value: _jobType,
          options: const {
            'fault_finding': 'Fault',
            'leak_repair': 'Leak',
            'safety_check': 'Check',
            'power_point_install': 'Install',
            'general_repair': 'Repair',
          },
          onChanged: (value) => setState(() => _jobType = value),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _descriptionController,
          minLines: 3,
          maxLines: 4,
          decoration: const InputDecoration(
            labelText: 'Tell Sally what happened',
            border: OutlineInputBorder(),
          ),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _addressController,
          decoration: const InputDecoration(
            labelText: 'Property address',
            border: OutlineInputBorder(),
          ),
        ),
        const SizedBox(height: 10),
        TextField(
          controller: _suburbController,
          decoration: const InputDecoration(
            labelText: 'Suburb',
            border: OutlineInputBorder(),
          ),
        ),
        const SizedBox(height: 12),
        _SegmentedChoice(
          label: 'Urgency',
          value: _urgency,
          options: const {
            'normal': 'Flexible',
            'high': 'Soon',
            'emergency': 'Urgent',
          },
          onChanged: (value) => setState(() => _urgency = value),
        ),
      ],
    );
  }

  Widget _availabilityCard() {
    final label = _isRental ? 'tenant' : 'owner';
    return _IntakeCard(
      title: 'When can the $label provide access?',
      subtitle:
          'George will only offer quote windows where requester and tradie availability overlap.',
      children: [
        for (final option in _availabilityOptions) ...[
          _ChoiceRow(
            selected: _selectedAvailability == option,
            title: option,
            subtitle: option == _availabilityOptions.first
                ? 'Best match candidate'
                : 'Backup access window',
            onTap: () => setState(() => _selectedAvailability = option),
          ),
          const SizedBox(height: 8),
        ],
        const _NoticeCard(
          icon: Icons.verified_user_outlined,
          title: 'Warranty first',
          body:
              'The intake payload requires Wally to check warranty and repeat-issue guardrails before new quotes are offered.',
        ),
      ],
    );
  }

  Widget _optionsCard() {
    final workOrderId = _intakeResult?['work_order_id']?.toString();
    if (_quotes.isEmpty) {
      return _IntakeCard(
        title: 'Matching quote options',
        subtitle:
            'n8n accepted the intake. Quote options are still loading or no matching tradie availability was returned.',
        children: [
          if (workOrderId != null) Text('Reference: $workOrderId'),
          const SizedBox(height: 12),
          OutlinedButton.icon(
            onPressed:
                workOrderId == null ? null : () => _fetchOptions(workOrderId),
            icon: const Icon(Icons.refresh),
            label: const Text('Refresh options'),
          ),
        ],
      );
    }

    return _IntakeCard(
      title:
          _canApproveInApp ? 'Pick a service option' : 'Sent to the approver',
      subtitle: _canApproveInApp
          ? 'Each option already fits the selected access window and tradie availability.'
          : 'The owner or landlord receives these options for approval in their flow.',
      children: [
        for (final quote in _quotes) ...[
          _QuoteOptionRow(
            quote: quote,
            selected: _selectedQuote?.id == quote.id,
            canSelect: _canApproveInApp,
            onTap: () => setState(() => _selectedQuote = quote),
          ),
          const SizedBox(height: 10),
        ],
        if (workOrderId != null)
          TextButton.icon(
            onPressed: () => context.go('/job/$workOrderId'),
            icon: const Icon(Icons.route_outlined),
            label: const Text('Open status'),
          ),
      ],
    );
  }

  Widget _bookingCard() {
    final quote = _selectedQuote;
    return _IntakeCard(
      title: 'Request booking',
      subtitle:
          'This mirrors the Uber request step: confirm the option, then n8n asks George to lock the appointment.',
      children: [
        if (quote != null) _QuoteOptionRow(quote: quote, selected: true),
        const SizedBox(height: 10),
        const _NoticeCard(
          icon: Icons.auto_awesome_outlined,
          title: 'Tradie acceptance',
          body:
              'UAT treats acceptance as automated when the tradie availability policy allows it. Manual tradie accept is the next phase.',
        ),
      ],
    );
  }

  Widget _activeCard() {
    final workOrderId = _bookingResult?['work_order_id']?.toString() ??
        _intakeResult?['work_order_id']?.toString() ??
        'pending';
    final message = _bookingResult?['message']?.toString() ??
        _bookingResult?['next_action']?.toString() ??
        'The job has been booked.';
    return _IntakeCard(
      title: 'Active job',
      subtitle:
          'The intake milestone is complete. Completion evidence, parts, warranty record and payment move into the next phase.',
      children: [
        _NoticeCard(
          icon: Icons.task_alt,
          title: workOrderId,
          body: message,
        ),
        const SizedBox(height: 12),
        FilledButton.icon(
          onPressed: () => context.go('/job/$workOrderId'),
          icon: const Icon(Icons.route_outlined),
          label: const Text('Track status'),
        ),
      ],
    );
  }
}

class _ProgressMap extends StatelessWidget {
  const _ProgressMap({
    required this.stage,
    required this.title,
    required this.subtitle,
  });

  final _IntakeStage stage;
  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    final activeIndex = _IntakeStage.values.indexOf(stage);
    final colorScheme = Theme.of(context).colorScheme;
    return Container(
      width: double.infinity,
      color: colorScheme.primaryContainer,
      padding: const EdgeInsets.fromLTRB(16, 18, 16, 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: Theme.of(context).textTheme.headlineSmall),
          const SizedBox(height: 6),
          Text(subtitle),
          const SizedBox(height: 18),
          Row(
            children: [
              for (var index = 0;
                  index < _IntakeStage.values.length;
                  index++) ...[
                _StepDot(active: index <= activeIndex, index: index + 1),
                if (index < _IntakeStage.values.length - 1)
                  Expanded(
                    child: Container(
                      height: 2,
                      color: index < activeIndex
                          ? colorScheme.primary
                          : colorScheme.outlineVariant,
                    ),
                  ),
              ],
            ],
          ),
        ],
      ),
    );
  }
}

class _StepDot extends StatelessWidget {
  const _StepDot({required this.active, required this.index});

  final bool active;
  final int index;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return CircleAvatar(
      radius: 14,
      backgroundColor: active ? colorScheme.primary : colorScheme.surface,
      child: Text(
        '$index',
        style: TextStyle(
          color: active ? colorScheme.onPrimary : colorScheme.onSurfaceVariant,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

class _StepSwitch extends StatelessWidget {
  const _StepSwitch({
    required this.stage,
    required this.triage,
    required this.availability,
    required this.options,
    required this.booking,
    required this.active,
  });

  final _IntakeStage stage;
  final Widget triage;
  final Widget availability;
  final Widget options;
  final Widget booking;
  final Widget active;

  @override
  Widget build(BuildContext context) {
    switch (stage) {
      case _IntakeStage.triage:
        return triage;
      case _IntakeStage.availability:
        return availability;
      case _IntakeStage.options:
        return options;
      case _IntakeStage.booking:
        return booking;
      case _IntakeStage.active:
        return active;
    }
  }
}

class _PersonaBanner extends StatelessWidget {
  const _PersonaBanner({required this.user});

  final AppUser? user;

  @override
  Widget build(BuildContext context) {
    if (user == null) return const SizedBox.shrink();
    return _NoticeCard(
      icon: Icons.account_circle_outlined,
      title: '${user!.name} - ${user!.personaLabel}',
      body: user!.propertyId == null
          ? 'No property selected yet. UAT defaults will be used.'
          : 'Property relationship: ${user!.propertyId}',
    );
  }
}

class _IntakeCard extends StatelessWidget {
  const _IntakeCard({
    required this.title,
    required this.subtitle,
    required this.children,
  });

  final String title;
  final String subtitle;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 4),
            Text(
              subtitle,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
            ),
            const SizedBox(height: 16),
            ...children,
          ],
        ),
      ),
    );
  }
}

class _SegmentedChoice extends StatelessWidget {
  const _SegmentedChoice({
    required this.label,
    required this.value,
    required this.options,
    required this.onChanged,
  });

  final String label;
  final String value;
  final Map<String, String> options;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: Theme.of(context).textTheme.labelLarge),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final entry in options.entries)
              ChoiceChip(
                label: Text(entry.value),
                selected: value == entry.key,
                onSelected: (_) => onChanged(entry.key),
              ),
          ],
        ),
      ],
    );
  }
}

class _ChoiceRow extends StatelessWidget {
  const _ChoiceRow({
    required this.selected,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  final bool selected;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
            color: selected
                ? Theme.of(context).colorScheme.primary
                : Theme.of(context).colorScheme.outlineVariant,
          ),
        ),
        child: Row(
          children: [
            Icon(selected
                ? Icons.radio_button_checked
                : Icons.radio_button_unchecked),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: Theme.of(context).textTheme.titleSmall),
                  const SizedBox(height: 2),
                  Text(subtitle),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _QuoteOptionRow extends StatelessWidget {
  const _QuoteOptionRow({
    required this.quote,
    required this.selected,
    this.canSelect = false,
    this.onTap,
  });

  final Quote quote;
  final bool selected;
  final bool canSelect;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return InkWell(
      onTap: canSelect ? onTap : null,
      borderRadius: BorderRadius.circular(8),
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: selected ? colorScheme.primaryContainer : colorScheme.surface,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
            color: selected ? colorScheme.primary : colorScheme.outlineVariant,
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                if (canSelect) ...[
                  Icon(selected ? Icons.check_circle : Icons.circle_outlined),
                  const SizedBox(width: 8),
                ],
                Expanded(
                  child: Text(
                    quote.displayName,
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                ),
                Text(
                  '\$${quote.amount.toStringAsFixed(0)}',
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                ),
              ],
            ),
            if (quote.scheduledWindow.isNotEmpty) ...[
              const SizedBox(height: 8),
              Row(
                children: [
                  const Icon(Icons.schedule_outlined, size: 18),
                  const SizedBox(width: 6),
                  Expanded(child: Text(quote.scheduledWindow)),
                ],
              ),
            ],
            const SizedBox(height: 8),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                if (quote.totalScore != null)
                  _MetricChip(label: 'Confidence ${quote.totalScore!.round()}'),
                if (quote.trustScore != null)
                  _MetricChip(label: 'Trust ${quote.trustScore!.round()}'),
                if (quote.availabilityScore != null)
                  _MetricChip(
                      label:
                          'Availability ${quote.availabilityScore!.round()}'),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _MetricChip extends StatelessWidget {
  const _MetricChip({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Chip(
      label: Text(label),
      visualDensity: VisualDensity.compact,
    );
  }
}

enum _NoticeTone { neutral, warning }

class _NoticeCard extends StatelessWidget {
  const _NoticeCard({
    required this.icon,
    required this.title,
    required this.body,
    this.tone = _NoticeTone.neutral,
  });

  final IconData icon;
  final String title;
  final String body;
  final _NoticeTone tone;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final color = tone == _NoticeTone.warning
        ? colorScheme.errorContainer
        : colorScheme.surfaceContainerHighest;
    return Card(
      color: color,
      margin: EdgeInsets.zero,
      child: ListTile(
        leading: Icon(icon),
        title: Text(title),
        subtitle: Text(body),
      ),
    );
  }
}

class _BottomActionBar extends StatelessWidget {
  const _BottomActionBar({
    required this.busy,
    required this.label,
    required this.icon,
    required this.enabled,
    required this.onPressed,
  });

  final bool busy;
  final String label;
  final IconData icon;
  final bool enabled;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Material(
      elevation: 8,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
        child: SizedBox(
          width: double.infinity,
          child: FilledButton.icon(
            onPressed: enabled ? onPressed : null,
            icon: busy
                ? const SizedBox.square(
                    dimension: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : Icon(icon),
            label: Text(busy ? 'Working' : label),
          ),
        ),
      ),
    );
  }
}
